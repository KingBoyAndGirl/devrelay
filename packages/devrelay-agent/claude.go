package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

// ── Claude Backend (one-shot stream-json with --resume) ────────

type claudeBackend struct{}

func (b *claudeBackend) Name() string { return "claude" }

func (b *claudeBackend) BuildArgs(prompt, sessionID string) []string {
	args := []string{"-p", prompt, "--output-format", "stream-json", "--verbose"}
	if sessionID != "" {
		args = append(args[:2], append([]string{"--resume", sessionID}, args[2:]...)...)
	}
	return args
}

func (b *claudeBackend) Execute(ctx context.Context, prompt string, opts ExecOptions, msgCh chan<- Message, resCh chan<- Result) {
	args := b.BuildArgs(prompt, opts.ResumeSessionID)
	cmd := exec.CommandContext(ctx, "claude", args...)
	cmd.Env = buildEnv(opts.EnvVars)
	cmd.Stdin = nil

	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		resCh <- Result{Status: "failed", Error: err.Error()}
		return
	}

	// Close stdin immediately (one-shot mode)
	// stdin is already nil, so nothing to close

	var output strings.Builder
	var sessionID string
	started := false

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 1024*1024), 10*1024*1024)

	// Read stderr in background
	stderrDone := make(chan []string, 1)
	go func() {
		var lines []string
		s := bufio.NewScanner(stderr)
		for s.Scan() {
			lines = append(lines, s.Text())
		}
		stderrDone <- lines
	}()

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		var msg struct {
			Type      string `json:"type"`
			SessionID string `json:"session_id,omitempty"`
			Subtype   string `json:"subtype,omitempty"`
			Message   struct {
				Content []struct {
					Type     string `json:"type"`
					Text     string `json:"text,omitempty"`
					Thinking string `json:"thinking,omitempty"`
					Name     string `json:"name,omitempty"`
					Input    any    `json:"input,omitempty"`
				} `json:"content"`
			} `json:"message,omitempty"`
		}

		if err := json.Unmarshal([]byte(line), &msg); err != nil {
			output.WriteString(line)
			output.WriteByte('\n')
			msgCh <- Message{Type: "raw", Text: line}
			continue
		}

		// Capture session_id from system and result events (multica pattern)
		if msg.SessionID != "" && msg.Type != "" {
			sessionID = msg.SessionID
		}

		switch msg.Type {
		case "system":
			if !started {
				started = true
			}

		case "assistant":
			for _, block := range msg.Message.Content {
				switch block.Type {
				case "text":
					output.WriteString(block.Text)
					msgCh <- Message{Type: "text", Text: block.Text}
				case "thinking":
					msgCh <- Message{Type: "thinking", Text: block.Thinking}
				case "tool_use":
					inputJSON, _ := json.MarshalIndent(block.Input, "", "  ")
					msgCh <- Message{Type: "tool_use", ToolName: block.Name, ToolInput: string(inputJSON)}
				}
			}

		case "user":
			for _, block := range msg.Message.Content {
				if block.Type == "tool_result" {
					msgCh <- Message{Type: "tool_result", Text: fmt.Sprintf("%v", block.Input)}
				}
			}

		case "result":
			output.WriteString(msg.Subtype)
		}
	}

	<-stderrDone
	err := cmd.Wait()

	status := "completed"
	errMsg := ""
	if ctx.Err() == context.DeadlineExceeded {
		status = "timeout"
	} else if err != nil {
		status = "failed"
		errMsg = err.Error()
	}

	resCh <- Result{
		Status:    status,
		Output:    output.String(),
		Error:     errMsg,
		SessionID: sessionID,
	}
}
