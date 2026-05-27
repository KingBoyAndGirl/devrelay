package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// ── Types ────────────────────────────────────────────────────────

type ExecOptions struct {
	Cwd              string
	Model            string
	TimeoutMs        int
	ResumeSessionID  string
	EnvVars          map[string]string
}

type Message struct {
	Type      string `json:"type"`
	Text      string `json:"text,omitempty"`
	ToolName  string `json:"toolName,omitempty"`
	ToolInput string `json:"toolInput,omitempty"`
}

type Result struct {
	Status    string `json:"status"`
	Output    string `json:"output"`
	Error     string `json:"error,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
	ExitCode  int    `json:"exitCode"`
}

type Backend interface {
	Name() string
	Execute(ctx context.Context, prompt string, opts ExecOptions, msgCh chan<- Message, resCh chan<- Result)
}

// ── Concurrency Limiter ──────────────────────────────────────────

type limiter struct{ ch chan struct{} }

func newLimiter(n int) *limiter { return &limiter{ch: make(chan struct{}, n)} }
func (l *limiter) acquire()     { l.ch <- struct{}{} }
func (l *limiter) release()     { <-l.ch }
func (l *limiter) active() int  { return len(l.ch) }

// ── Config ───────────────────────────────────────────────────────

type Config struct {
	Port          int
	Token         string
	ServerURL     string
	MaxConcurrent int
	TimeoutMs     int
	HeartbeatMs   int
}

// ── Server ───────────────────────────────────────────────────────

type server struct {
	cfg      func() Config
	backends map[string]Backend
	limiter  *limiter
}

func newServer() *server {
	cfg := resolveConfig()
	return &server{
		cfg: func() Config { return resolveConfig() },
		backends: map[string]Backend{
			"claude":   &claudeBackend{},
			"codex":    &codexBackend{},
			"hermes":   &hermesBackend{},
			
		},
		limiter: newLimiter(cfg.MaxConcurrent),
	}
}

func (s *server) checkAuth(r *http.Request) bool {
	cfg := s.cfg()
	if cfg.Token == "" {
		return true
	}
	return r.Header.Get("Authorization") == "Bearer "+cfg.Token
}

// ServeHTTP implements http.Handler interface
func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// CORS preflight
	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.WriteHeader(http.StatusOK)
		return
	}

	// Auth check (except health)
	if r.URL.Path != "/health" && !s.checkAuth(r) {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Route
	switch r.URL.Path {
	case "/health":
		s.handleHealth(w, r)
	case "/discover":
		s.handleDiscover(w, r)
	case "/execute":
		if r.Method != "POST" {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}
		s.handleExecute(w, r)
	default:
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
	}
}

// ── SSE Helpers ──────────────────────────────────────────────────

type sseWriter struct {
	w       http.ResponseWriter
	flusher http.Flusher
	mu      sync.Mutex
}

func newSSEWriter(w http.ResponseWriter) *sseWriter {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	f, _ := w.(http.Flusher)
	return &sseWriter{w: w, flusher: f}
}

func (s *sseWriter) write(data map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	jsonData, _ := json.Marshal(data)
	fmt.Fprintf(s.w, "data: %s\n\n", jsonData)
	if s.flusher != nil {
		s.flusher.Flush()
	}
}

// ── Route Handlers ──────────────────────────────────────────────

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	cfg := s.cfg()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status": "ok", "activeCount": s.limiter.active(),
		"maxConcurrent": cfg.MaxConcurrent, "queueLength": 0,
	})
}

func (s *server) handleDiscover(w http.ResponseWriter, r *http.Request) {
	knownCLIs := []string{"claude", "codex", "copilot", "openclaw", "opencode", "hermes", "gemini", "pi", "cursor-agent", "kimi", "kiro-cli"}
	type cliInfo struct {
		Bin     string `json:"bin"`
		Found   bool   `json:"found"`
		Path    string `json:"path"`
		Version string `json:"version"`
	}
	var clis []cliInfo
	for _, bin := range knownCLIs {
		info := cliInfo{Bin: bin}
		if path, err := exec.LookPath(bin); err == nil {
			info.Found, info.Path = true, path
			if out, err := exec.Command(bin, "--version").CombinedOutput(); err == nil {
				info.Version = strings.SplitN(strings.TrimSpace(string(out)), "\n", 2)[0]
				if len(info.Version) > 200 { info.Version = info.Version[:200] }
			}
		}
		clis = append(clis, info)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"clis": clis})
}

func (s *server) handleExecute(w http.ResponseWriter, r *http.Request) {
	cfg := s.cfg()
	var req struct {
		CLI       string            `json:"cli"`
		Prompt    string            `json:"prompt"`
		EnvVars   map[string]string `json:"envVars"`
		SessionID string            `json:"sessionId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid JSON"}`, 400)
		return
	}
	if strings.TrimSpace(req.Prompt) == "" {
		http.Error(w, `{"error":"prompt is required"}`, 400)
		return
	}
	if req.CLI == "" {
		req.CLI = "claude"
	}
	if s.limiter.active() >= cfg.MaxConcurrent {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(429)
		json.NewEncoder(w).Encode(map[string]any{"error": "Too many agents running", "queuePosition": 1})
		return
	}

	s.limiter.acquire()
	defer s.limiter.release()

	backend, ok := s.backends[req.CLI]
	if !ok {
		backend = s.backends["claude"]
	}

	sse := newSSEWriter(w)
	ctx, cancel := context.WithTimeout(r.Context(), time.Duration(cfg.TimeoutMs)*time.Millisecond)
	defer cancel()

	msgCh := make(chan Message, 256)
	resCh := make(chan Result, 1)

	go backend.Execute(ctx, req.Prompt, ExecOptions{
		EnvVars: req.EnvVars, ResumeSessionID: req.SessionID, Cwd: resolveCWD(), TimeoutMs: cfg.TimeoutMs,
	}, msgCh, resCh)

	heartbeat := time.NewTicker(time.Duration(cfg.HeartbeatMs) * time.Millisecond)
	defer heartbeat.Stop()

	hadTextOutput := false

	for {
		select {
		case msg := <-msgCh:
			switch msg.Type {
			case "text":
				hadTextOutput = true
				sse.write(map[string]any{"type": "text", "content": msg.Text})
			case "thinking":
				sse.write(map[string]any{"type": "thinking", "content": msg.Text})
			case "tool_use":
				sse.write(map[string]any{"type": "tool_use", "tool": msg.ToolName, "input": msg.ToolInput})
			case "tool_result":
				sse.write(map[string]any{"type": "tool_result", "output": msg.Text})
			case "error":
				sse.write(map[string]any{"type": "error", "content": msg.Text})
			}

		case result := <-resCh:
			// Only send result.Output as fallback if no text was sent via msgCh.
			// Backends already send final output through msgCh — sending again
			// here causes duplicate content in the UI.
			if !hadTextOutput && result.Output != "" {
				sse.write(map[string]any{"type": "text", "content": result.Output})
			}
			sse.write(map[string]any{
				"type": "exit", "exitCode": result.ExitCode, "status": result.Status,
				"error": result.Error, "sessionId": result.SessionID,
				"finalStatus": normalizeStatus(result.Status),
			})
			return

		case <-heartbeat.C:
			sse.write(map[string]any{"type": "status", "status": "heartbeat"})
		case <-ctx.Done():
			sse.write(map[string]any{"type": "exit", "finalStatus": "timeout"})
			return
		case <-r.Context().Done():
			return
		}
	}
}

func normalizeStatus(s string) string {
	switch s {
	case "completed":
		return "completed"
	case "timeout":
		return "timeout"
	case "cancelled", "aborted":
		return "aborted"
	default:
		return "failed"
	}
}
