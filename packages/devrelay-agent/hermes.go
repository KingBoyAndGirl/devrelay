package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

// ── Hermes Backend (acp + JSON-RPC over stdio, multica pattern) ──

type hermesBackend struct{}

func (b *hermesBackend) Name() string { return "hermes" }

func (b *hermesBackend) BuildArgs(_, _ string) []string {
	return []string{"acp"}
}

func extractACPSessionID(raw json.RawMessage) string {
	var resp struct {
		SessionID string `json:"sessionId"`
	}
	if json.Unmarshal(raw, &resp) == nil && resp.SessionID != "" {
		return resp.SessionID
	}
	// Also try protocol v1 envelope
	var env struct {
		Result struct {
			SessionID string `json:"sessionId"`
		} `json:"result"`
	}
	if json.Unmarshal(raw, &env) == nil && env.Result.SessionID != "" {
		return env.Result.SessionID
	}
	return ""
}

func (b *hermesBackend) Execute(ctx context.Context, prompt string, opts ExecOptions, msgCh chan<- Message, resCh chan<- Result) {
	cmd := exec.CommandContext(ctx, "hermes", b.BuildArgs("", "")...)
	env := buildEnv(opts.EnvVars)
	env = append(env, "HERMES_YOLO_MODE=1")
	cmd.Env = env

	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		resCh <- Result{Status: "failed", Error: err.Error()}
		return
	}

	rpc := newRPCHandler(stdin, stdout)
	promptDone := make(chan struct {
		status string
		err    string
	}, 2)
	var output strings.Builder
	var sessionID string
	resumeRequested := opts.ResumeSessionID

	// Stderr reader
	stderrCh := make(chan string, 1)
	go func() {
		var buf strings.Builder
		s := make([]byte, 4096)
		for {
			n, err := stderr.Read(s)
			if n > 0 {
				buf.Write(s[:n])
			}
			if err != nil {
				break
			}
		}
		stderrCh <- buf.String()
	}()

	// Stdout reader
	stdoutDone := make(chan struct{})
	go func() {
		for rpc.scanner.Scan() {
			rpc.dispatch(rpc.scanner.Text(), func(method string, params json.RawMessage) {
				switch method {
				case "session/update":
					var ev struct {
						SessionID string `json:"sessionId,omitempty"`
						Update    struct {
							Type string `json:"type"`
							Text string `json:"text,omitempty"`
							Name string `json:"name,omitempty"`
							Args json.RawMessage `json:"args,omitempty"`
							Result json.RawMessage `json:"result,omitempty"`
						} `json:"update"`
					}
					json.Unmarshal(params, &ev)
					if ev.SessionID != "" {
						sessionID = ev.SessionID
					}
					switch ev.Update.Type {
					case "agent_message_chunk":
						output.WriteString(ev.Update.Text)
						msgCh <- Message{Type: "text", Text: ev.Update.Text}
					case "agent_thought_chunk":
						msgCh <- Message{Type: "thinking", Text: ev.Update.Text}
					case "tool_call":
						msgCh <- Message{Type: "tool_use", ToolName: ev.Update.Name, ToolInput: string(ev.Update.Args)}
					case "tool_call_update":
						if ev.Update.Result != nil {
							msgCh <- Message{Type: "tool_result", Text: string(ev.Update.Result)}
						}
					case "turn_end":
						promptDone <- struct {
							status string
							err    string
						}{status: "completed", err: ""}
					}

				case "session/notification":
					var ev struct {
						Notification struct {
							Type string `json:"type"`
						} `json:"notification"`
					}
					json.Unmarshal(params, &ev)
					if ev.Notification.Type == "turn_end" {
						promptDone <- struct {
							status string
							err    string
						}{status: "completed", err: ""}
					}

				case "session/request_permission":
					// Auto-approve permissions (YOLO mode fallback for ACP)
					// Find the request ID and auto-approve
					var req struct {
						RequestID string `json:"requestId"`
					}
					json.Unmarshal(params, &req)
					if req.RequestID != "" {
						rpc.request(ctx, "session/respond_permission", map[string]any{
							"requestId": req.RequestID,
							"decision":  "approve_for_session",
						})
					}
				}
			})
		}
		close(stdoutDone)
	}()

	finalStatus := "failed"
	errMsg := ""

	// 1. Initialize
	_, err := rpc.request(ctx, "initialize", map[string]any{
		"protocolVersion": "2025-01-15",
		"clientInfo": map[string]string{
			"name":    "devrelay",
			"version": "1.0.0",
		},
	})
	if err != nil {
		errMsg = fmt.Sprintf("initialize: %v", err)
		goto done
	}
	rpc.notify("initialized", nil)

	// 2. Create or resume session
	if resumeRequested != "" {
		resp, resumeErr := rpc.request(ctx, "session/resume", map[string]any{
			"sessionId": resumeRequested,
		})
		if resumeErr == nil {
			sessionID = extractACPSessionID(resp)
		}
	}
	if sessionID == "" {
		resp, err := rpc.request(ctx, "session/new", map[string]any{
			"cwd": opts.Cwd,
		})
		if err != nil {
			errMsg = fmt.Sprintf("session/new: %v", err)
			goto done
		}
		sessionID = extractACPSessionID(resp)
	}

	// 3. Set model if specified
	if opts.Model != "" {
		rpc.request(ctx, "session/set_model", map[string]any{
			"sessionId": sessionID,
			"model":     opts.Model,
		})
	}

	// 4. Send prompt
	_, err = rpc.request(ctx, "session/prompt", map[string]any{
		"sessionId": sessionID,
		"prompt":    prompt,
	})
	if err != nil {
		errMsg = fmt.Sprintf("session/prompt: %v", err)
		goto done
	}

	// 5. Wait for completion
	select {
	case result := <-promptDone:
		if result.status == "completed" {
			finalStatus = "completed"
		} else {
			finalStatus = "failed"
			errMsg = result.err
		}
	case <-ctx.Done():
		finalStatus = "timeout"
	}

done:
	stdin.Close()
	<-stdoutDone
	cmd.Wait()
	stderrTail := <-stderrCh

	// Check stderr for provider errors
	if finalStatus == "completed" && output.Len() == 0 && stderrTail != "" {
		finalStatus = "failed"
		errMsg = stderrTail
	}

	// Retry logic: if resume failed and session ID didn't match
	if resumeRequested != "" && finalStatus == "failed" && sessionID == "" {
		sessionID = ""
	}

	resCh <- Result{
		Status:    finalStatus,
		Output:    output.String(),
		Error:     errMsg,
		SessionID: sessionID,
	}
}
