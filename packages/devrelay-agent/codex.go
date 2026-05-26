package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
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
	scanner  *bufio.Scanner
	stdin    io.Writer
	mu       sync.Mutex
	reqID    int
	pending  map[int]chan jsonAndErr
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
			ch <- jsonAndErr{Result: req.Result, Err: nil}
			close(ch)
		}
		return
	}

	// Notification
	if req.Method != "" && notifFn != nil {
		notifFn(req.Method, req.Params)
	}
}

func extractCodexThreadID(raw json.RawMessage) string {
	var resp struct {
		Thread struct{
			ID string `json:"id"`
		} `json:"thread"`
	}
	if json.Unmarshal(raw, &resp) == nil && resp.Thread.ID != "" {
		return resp.Thread.ID
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

	rpc := newRPCHandler(stdin, stdout)
	turnDone := make(chan string, 2)
	var output strings.Builder
	var sessionID string

	// Stderr reader goroutine
	stderrCh := make(chan string, 1)
	go func() {
		var buf strings.Builder
		s := bufio.NewScanner(stderr)
		for s.Scan() { buf.WriteString(s.Text()); buf.WriteByte('\n') }
		stderrCh <- buf.String()
	}()

	// Stdout reader goroutine
	stdoutDone := make(chan struct{})
	go func() {
		for rpc.scanner.Scan() {
			rpc.dispatch(rpc.scanner.Text(), func(method string, params json.RawMessage) {
				switch method {
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
					msgCh <- Message{Type: "error", Text: fmt.Sprintf("%v", params)}
				}
			})
		}
		close(stdoutDone)
	}()

	finalStatus := "failed"
	errMsg := ""

	// 1. Initialize
	_, err := rpc.request(ctx, "initialize", map[string]any{
		"protocolVersion": "1.0",
		"capabilities":    map[string]any{},
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

	// 2. Thread start or resume
	if opts.ResumeSessionID != "" {
		resp, resumeErr := rpc.request(ctx, "thread/resume", map[string]any{
			"thread_id": opts.ResumeSessionID,
		})
		if resumeErr == nil {
			sessionID = extractCodexThreadID(resp)
		}
	}
	if sessionID == "" {
		resp, err := rpc.request(ctx, "thread/start", map[string]any{
			"cwd":                    opts.Cwd,
			"persistExtendedHistory": true,
		})
		if err != nil {
			errMsg = fmt.Sprintf("thread/start: %v", err)
			goto done
		}
		sessionID = extractCodexThreadID(resp)
	}

	// 3. Turn start
	_, err = rpc.request(ctx, "turn/start", map[string]any{
		"thread_id": sessionID,
		"input": map[string]any{
			"type": "user_message",
			"message": map[string]any{
				"role": "user",
				"content": []map[string]any{
					{"type": "input_text", "text": prompt},
				},
			},
		},
	})
	if err != nil {
		errMsg = fmt.Sprintf("turn/start: %v", err)
		goto done
	}

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

	resCh <- Result{
		Status:    finalStatus,
		Output:    output.String(),
		Error:     errMsg,
		SessionID: sessionID,
	}
}
