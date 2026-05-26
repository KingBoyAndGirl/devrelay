package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os/exec"
	"strings"
	"sync"
)

// ── Codex Backend (app-server + JSON-RPC over stdio, multica pattern) ──

type codexBackend struct{}

func (b *codexBackend) Name() string { return "codex" }

func (b *codexBackend) BuildArgs(_, _ string) []string {
	return []string{"app-server", "--listen", "stdio://"}
}

type rpcHandler struct {
	scanner *bufio.Scanner
	stdin   io.Writer
	mu      sync.Mutex
	reqID   int
	pending map[int]chan jsonAndErr
}

type jsonAndErr struct {
	Result json.RawMessage
	Err    error
}

func newRPCHandler(stdin io.Writer, stdout io.Reader) *rpcHandler {
	r := &rpcHandler{
		scanner: bufio.NewScanner(stdout),
		stdin:   stdin,
		pending: make(map[int]chan jsonAndErr),
	}
	r.scanner.Buffer(make([]byte, 0, 1024*1024), 10*1024*1024)
	return r
}

func (r *rpcHandler) request(ctx context.Context, method string, params map[string]any) (json.RawMessage, error) {
	r.mu.Lock()
	r.reqID++
	id := r.reqID
	ch := make(chan jsonAndErr, 1)
	r.pending[id] = ch
	r.mu.Unlock()

	req := map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params}
	data, _ := json.Marshal(req)
	r.stdin.Write(append(data, '\n'))

	select {
	case resp := <-ch:
		return resp.Result, resp.Err
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (r *rpcHandler) notify(method string, params map[string]any) {
	req := map[string]any{"jsonrpc": "2.0", "method": method, "params": params}
	data, _ := json.Marshal(req)
	r.stdin.Write(append(data, '\n'))
}

func (r *rpcHandler) dispatch(line string, notifFn func(method string, params json.RawMessage)) {
	if line == "" {
		return
	}

	var req struct {
		ID     int             `json:"id,omitempty"`
		Method string          `json:"method,omitempty"`
		Result json.RawMessage `json:"result,omitempty"`
		Error  json.RawMessage `json:"error,omitempty"`
		Params json.RawMessage `json:"params,omitempty"`
	}

	if err := json.Unmarshal([]byte(line), &req); err != nil {
		return
	}

	// Response to our request
	if req.ID != 0 {
		r.mu.Lock()
		ch, ok := r.pending[req.ID]
		delete(r.pending, req.ID)
		r.mu.Unlock()
		if ok {
			var errResp struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
			}
			var rpcErr error
			if json.Unmarshal(req.Error, &errResp) == nil && errResp.Message != "" {
				rpcErr = fmt.Errorf("%s", errResp.Message)
			}
			ch <- jsonAndErr{Result: req.Result, Err: rpcErr}
			close(ch)
		}
		return
	}

	// Notification
	if req.Method != "" && notifFn != nil {
		notifFn(req.Method, req.Params)
	}
}

func extractThreadIDFromNotification(params json.RawMessage) string {
	var ev struct {
		Thread struct {
			ID string `json:"id"`
		} `json:"thread"`
	}
	if json.Unmarshal(params, &ev) == nil && ev.Thread.ID != "" {
		return ev.Thread.ID
	}
	return ""
}

func (b *codexBackend) Execute(ctx context.Context, prompt string, opts ExecOptions, msgCh chan<- Message, resCh chan<- Result) {
	cmd := exec.CommandContext(ctx, "codex", b.BuildArgs("", "")...)
	cmd.Env = buildEnv(opts.EnvVars)

	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		resCh <- Result{Status: "failed", Error: err.Error()}
		return
	}
	log.Printf("[codex] app-server started (pid=%d)", cmd.Process.Pid)

	rpc := newRPCHandler(stdin, stdout)
	turnDone := make(chan string, 2)
	threadReady := make(chan string, 1) // v2: thread/started delivers thread ID via notification
	var output strings.Builder
	var sessionID string

	// Stderr reader goroutine
	stderrCh := make(chan string, 1)
	go func() {
		var buf strings.Builder
		s := bufio.NewScanner(stderr)
		for s.Scan() {
			buf.WriteString(s.Text())
			buf.WriteByte('\n')
		}
		stderrCh <- buf.String()
	}()

	// Stdout reader goroutine
	stdoutDone := make(chan struct{})
	go func() {
		for rpc.scanner.Scan() {
			rpc.dispatch(rpc.scanner.Text(), func(method string, params json.RawMessage) {
				switch method {
				// v1 notifications (backwards compat)
				case "codex/event":
					var ev struct {
						Type    string `json:"type"`
						Message struct {
							Role    string `json:"role"`
							Content string `json:"content"`
						} `json:"message"`
					}
					json.Unmarshal(params, &ev)
					switch ev.Type {
					case "agent_message":
						output.WriteString(ev.Message.Content)
						msgCh <- Message{Type: "text", Text: ev.Message.Content}
					case "task_complete", "turn_done":
						turnDone <- "completed"
					}

				// v2 notifications
				case "thread/started":
					if tid := extractThreadIDFromNotification(params); tid != "" {
						threadReady <- tid
					}

				// v2 delta streaming (both naming conventions)
				case "agent_message/delta", "item/agentMessage/delta":
					var ev struct {
						Delta string `json:"delta"`
					}
					if json.Unmarshal(params, &ev) == nil && ev.Delta != "" {
						output.WriteString(ev.Delta)
					}

				case "turn/completed":
					var ev struct {
						Turn struct {
							Status string `json:"status"`
						} `json:"turn"`
					}
					json.Unmarshal(params, &ev)
					turnDone <- ev.Turn.Status

				case "thread/status/changed":
					var ev struct {
						Status string `json:"status"`
					}
					json.Unmarshal(params, &ev)
					if ev.Status == "idle" {
						turnDone <- "completed"
					}

				// v1 fallbacks
				case "item/agent_message":
					var ev struct {
						Item struct {
							Text string `json:"text"`
						} `json:"item"`
					}
					json.Unmarshal(params, &ev)
					if ev.Item.Text != "" {
						output.WriteString(ev.Item.Text)
						msgCh <- Message{Type: "text", Text: ev.Item.Text}
					}

				case "item/command_execution":
					msgCh <- Message{Type: "tool_use", ToolName: "exec_command"}

				case "error":
					var ev struct {
						Error struct {
							Message string `json:"message"`
						} `json:"error"`
					}
					msg := string(params)
					if json.Unmarshal(params, &ev) == nil && ev.Error.Message != "" {
						msg = ev.Error.Message
					}
					msgCh <- Message{Type: "error", Text: msg}

				// Ignored system notifications
				case "configWarning", "deprecationNotice", "warning",
					"remoteControl/status/changed",
					"item/started", "item/completed",
					"turn/started", "turn/plan/updated",
					"plan/delta", "reasoning_summary/text_delta",
					"command_exec/output_delta", "file_change/output_delta",
					"process/output_delta", "process/exited",
					"thread/token_usage/updated", "thread/tokenUsage/updated",
					"account/rateLimits/updated":
					// silently ignore

				default:
					log.Printf("[codex] unknown notification: %s params=%s", method, string(params))
				}
			})
		}
		close(stdoutDone)
	}()

	finalStatus := "failed"
	errMsg := ""

	// 1. Initialize
	log.Printf("[codex] sending initialize RPC...")
	_, err := rpc.request(ctx, "initialize", map[string]any{
		"protocolVersion": "1.0",
		"capabilities": map[string]any{
			"experimentalApi": true,
		},
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
	log.Printf("[codex] initialize OK")

	// 2. Thread start or resume
	log.Printf("[codex] starting thread (resume=%v)...", opts.ResumeSessionID != "")
	if opts.ResumeSessionID != "" {
		resp, resumeErr := rpc.request(ctx, "thread/resume", map[string]any{
			"threadId": opts.ResumeSessionID,
		})
		if resumeErr == nil {
			sessionID = extractThreadIDFromNotification(resp)
		}
	}

	if sessionID == "" {
		_, err := rpc.request(ctx, "thread/start", map[string]any{
			"cwd": opts.Cwd,
		})
		if err != nil {
			errMsg = fmt.Sprintf("thread/start: %v", err)
			goto done
		}
		// v2: thread/start response is minimal; thread ID arrives via thread/started notification
		select {
		case tid := <-threadReady:
			sessionID = tid
		case <-ctx.Done():
			errMsg = "timeout waiting for thread/started"
			goto done
		}
	}
	log.Printf("[codex] thread ready (id=%s)", sessionID)

	// 3. Turn start
	log.Printf("[codex] starting turn...")
	_, err = rpc.request(ctx, "turn/start", map[string]any{
		"threadId": sessionID,
		"input": []map[string]any{
			{
				"type": "text",
				"text": prompt,
			},
		},
	})
	if err != nil {
		errMsg = fmt.Sprintf("turn/start: %v", err)
		goto done
	}
	log.Printf("[codex] turn started, waiting for completion...")

	// 4. Wait for completion
	select {
	case status := <-turnDone:
		if status == "completed" || status == "" {
			finalStatus = "completed"
		} else if status == "cancelled" || status == "canceled" || status == "aborted" || status == "interrupted" {
			finalStatus = "aborted"
		} else {
			finalStatus = "failed"
			errMsg = status
		}
	case <-ctx.Done():
		finalStatus = "timeout"
	}

done:
	stdin.Close()
	<-stdoutDone
	cmd.Wait()
	stderrTail := <-stderrCh

	if finalStatus == "failed" && errMsg == "" && stderrTail != "" {
		errMsg = stderrTail
	}

	// Retry logic: if resume was attempted but failed with no new session, clear session
	if opts.ResumeSessionID != "" && finalStatus == "failed" && sessionID == "" {
		sessionID = "" // Signal to caller that resume didn't land
	}

	// Flush accumulated output as a single message before exit
	if output.Len() > 0 {
		msgCh <- Message{Type: "text", Text: output.String()}
	}

	resCh <- Result{
		Status:    finalStatus,
		Output:    output.String(),
		Error:     errMsg,
		SessionID: sessionID,
	}
}
