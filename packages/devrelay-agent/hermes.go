package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
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
	log.Printf("[hermes] acp started (pid=%d)", cmd.Process.Pid)

	rpc := newRPCHandler(stdin, stdout)
	promptDone := make(chan struct {
		status string
		err    string
	}, 2)
	var output strings.Builder
	var sessionID string
	var promptInProgress bool
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

	// Stdout reader — dispatches notifications
	stdoutDone := make(chan struct{})
	go func() {
		for rpc.scanner.Scan() {
			rpc.dispatch(rpc.scanner.Text(), func(method string, params json.RawMessage) {
				switch method {
				case "session/update":
					var ev struct {
						SessionID string `json:"sessionId,omitempty"`
						Update    struct {
							SessionUpdate string `json:"sessionUpdate"`
							Content       struct {
								Text string `json:"text"`
								Type string `json:"type"`
							} `json:"content"`
							Name   string          `json:"name,omitempty"`
							Args   json.RawMessage `json:"args,omitempty"`
							Result json.RawMessage `json:"result,omitempty"`
						} `json:"update"`
					}
					json.Unmarshal(params, &ev)
					if ev.SessionID != "" {
						sessionID = ev.SessionID
					}
					switch ev.Update.SessionUpdate {
					case "agent_message_chunk":
						output.WriteString(ev.Update.Content.Text)
						msgCh <- Message{Type: "text", Text: ev.Update.Content.Text}
					case "agent_thought_chunk":
						msgCh <- Message{Type: "thinking", Text: ev.Update.Content.Text}
					case "tool_call":
						msgCh <- Message{Type: "tool_use", ToolName: ev.Update.Name, ToolInput: string(ev.Update.Args)}
					case "tool_call_update":
						if ev.Update.Result != nil {
							msgCh <- Message{Type: "tool_result", Text: string(ev.Update.Result)}
						}
					case "turn_end":
						if promptInProgress {
							promptDone <- struct {
								status string
								err    string
							}{status: "completed", err: ""}
						}
					}

				case "session/notification":
					var ev struct {
						Notification struct {
							Type string `json:"type"`
						} `json:"notification"`
					}
					json.Unmarshal(params, &ev)
					if ev.Notification.Type == "turn_end" {
						if promptInProgress {
							promptDone <- struct {
								status string
								err    string
							}{status: "completed", err: ""}
						}
					}

				case "session/request_permission":
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
	log.Printf("[hermes] sending initialize RPC...")
	_, err := rpc.request(ctx, "initialize", map[string]any{
		"protocolVersion": 1,
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
	log.Printf("[hermes] initialize OK")

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
			"cwd":        opts.Cwd,
			"mcpServers": []any{},
		})
		if err != nil {
			errMsg = fmt.Sprintf("session/new: %v", err)
			goto done
		}
		sessionID = extractACPSessionID(resp)
	}
	log.Printf("[hermes] session ready (id=%s)", sessionID)

	// 3. Set model if specified
	if opts.Model != "" {
		rpc.request(ctx, "session/set_model", map[string]any{
			"sessionId": sessionID,
			"model":     opts.Model,
		})
	}

	// 4. Send prompt — the RPC response IS the completion signal in ACP v1
	log.Printf("[hermes] sending prompt...")
	_, err = rpc.request(ctx, "session/prompt", map[string]any{
		"sessionId": sessionID,
		"prompt":    []map[string]any{{"type": "text", "text": prompt}},
	})
	if err != nil {
		errMsg = fmt.Sprintf("session/prompt: %v", err)
		goto done
	}

	// ACP v1: prompt response = turn complete (notifications already processed above)
	finalStatus = "completed"

done:
	stdin.Close()
	<-stdoutDone
	cmd.Wait()
	stderrTail := <-stderrCh

	// Check stderr for provider errors when no output was produced
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
