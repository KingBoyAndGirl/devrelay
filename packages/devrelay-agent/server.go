package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// ── Types ───────────────────────────────────────────────────────

type ExecOptions struct {
	Cwd              string
	Model            string
	TimeoutMs        int
	ResumeSessionID  string
	SystemPrompt     string
	EnvVars          map[string]string
	MaxTurns         int
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
	BuildArgs(prompt, sessionID string) []string
	Execute(ctx context.Context, prompt string, opts ExecOptions, msgCh chan<- Message, resCh chan<- Result)
}

// ── Concurrency Limiter ─────────────────────────────────────────

type limiter struct {
	ch chan struct{}
}

func newLimiter(n int) *limiter {
	return &limiter{ch: make(chan struct{}, n)}
}

func (l *limiter) acquire() {
	l.ch <- struct{}{}
}

func (l *limiter) release() {
	<-l.ch
}

func (l *limiter) active() int {
	return len(l.ch)
}

// ── Server ──────────────────────────────────────────────────────

type server struct {
	cfg      func() Config
	backends map[string]Backend
	limiter  *limiter
}

type Config struct {
	Port          int
	Token         string
	ServerURL     string
	MaxConcurrent int
	TimeoutMs     int
	HeartbeatMs   int
}

func newServer() *server {
	cfg := resolveConfig()
	return &server{
		cfg: func() Config {
			c := resolveConfig()
			return Config{
				Port:          c.Port,
				Token:         c.Token,
				ServerURL:     c.ServerURL,
				MaxConcurrent: c.MaxConcurrent,
				TimeoutMs:     c.TimeoutMs,
				HeartbeatMs:   c.HeartbeatMs,
			}
		},
		backends: map[string]Backend{
			"claude": &claudeBackend{},
			"codex":  &codexBackend{},
			"hermes": &hermesBackend{},
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

// ── SSE Helpers ─────────────────────────────────────────────────

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
		"status":        "ok",
		"activeCount":   s.limiter.active(),
		"maxConcurrent": cfg.MaxConcurrent,
		"queueLength":   0,
		"uptime":        time.Since(startTime).Seconds(),
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
		path, err := exec.LookPath(bin)
		if err == nil {
			info.Found = true
			info.Path = path
			out, err := exec.Command(bin, "--version").CombinedOutput()
			if err == nil {
				info.Version = strings.SplitN(strings.TrimSpace(string(out)), "\n", 2)[0]
				if len(info.Version) > 200 {
					info.Version = info.Version[:200]
				}
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
		json.NewEncoder(w).Encode(map[string]any{
			"error":         "Too many agents running",
			"queuePosition": 1,
		})
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
		EnvVars:         req.EnvVars,
		ResumeSessionID: req.SessionID,
		Cwd:             resolveCWD(),
		TimeoutMs:       cfg.TimeoutMs,
	}, msgCh, resCh)

	heartbeat := time.NewTicker(time.Duration(cfg.HeartbeatMs) * time.Millisecond)
	defer heartbeat.Stop()

	for {
		select {
		case msg := <-msgCh:
			switch msg.Type {
			case "text":
				sse.write(map[string]any{"type": "stdout", "data": msg.Text + "\n"})
			case "thinking":
				sse.write(map[string]any{"type": "stdout", "data": msg.Text + "\n"})
			case "tool_use":
				data := fmt.Sprintf("Tool: %s\n%s", msg.ToolName, msg.ToolInput)
				sse.write(map[string]any{"type": "stdout", "data": data})
			case "tool_result":
				sse.write(map[string]any{"type": "stdout", "data": msg.Text + "\n"})
			case "error":
				sse.write(map[string]any{"type": "error", "error": msg.Text})
			case "raw":
				sse.write(map[string]any{"type": "stdout", "data": msg.Text})
			}

		case result := <-resCh:
			// Flush accumulated output (e.g. Codex deltas) before exit
			if result.Output != "" {
				sse.write(map[string]any{"type": "stdout", "data": result.Output})
			}
			sse.write(map[string]any{
				"type":      "exit",
				"exitCode":  result.ExitCode,
				"status":    result.Status,
				"error":     result.Error,
				"sessionId": result.SessionID,
			})
			// If resume failed with stale session, signal for retry
			if result.Status == "failed" && req.SessionID != "" && result.SessionID == "" {
				sse.write(map[string]any{"type": "resume_failed", "stale": true})
			}
			return

		case <-heartbeat.C:
			sse.write(map[string]any{"type": "heartbeat"})

		case <-ctx.Done():
			sse.write(map[string]any{"type": "timeout"})
			return

		case <-r.Context().Done():
			return
		}
	}
}

func (s *server) handleMCP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Jsonrpc string          `json:"jsonrpc"`
		ID      any             `json:"id"`
		Method  string          `json:"method"`
		Params  json.RawMessage `json:"params"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	switch req.Method {
	case "initialize":
		json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      req.ID,
			"result": map[string]any{
				"protocolVersion": "2024-11-05",
				"capabilities":    map[string]any{"tools": map[string]any{}},
				"serverInfo":      map[string]string{"name": "devrelay", "version": "1.0.0"},
			},
		})
	case "tools/list":
		tools := []map[string]any{
			{
				"name":        "claude_code_execute",
				"description": "Execute a prompt using Claude Code CLI.",
				"inputSchema": map[string]any{
					"type":       "object",
					"properties": map[string]any{"prompt": map[string]string{"type": "string"}},
					"required":   []string{"prompt"},
				},
			},
		}
		json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      req.ID,
			"result":  map[string]any{"tools": tools},
		})
	default:
		json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      req.ID,
			"error":   map[string]any{"code": -32601, "message": "Method not found"},
		})
	}
}

func (s *server) handleCORS(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.WriteHeader(204)
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	log.Printf("DEBUG %s %s", r.Method, r.URL.Path)
	if r.Method == "OPTIONS" {
		s.handleCORS(w, r)
		return
	}

	// Health check doesn't require auth
	if r.URL.Path == "/health" && r.Method == "GET" {
		s.handleHealth(w, r)
		return
	}

	if !s.checkAuth(r) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(401)
		json.NewEncoder(w).Encode(map[string]string{"error": "Unauthorized"})
		return
	}

	switch {
	case r.URL.Path == "/discover" && r.Method == "GET":
		s.handleDiscover(w, r)
	case r.URL.Path == "/execute" && r.Method == "POST":
		s.handleExecute(w, r)
	case r.URL.Path == "/mcp" && r.Method == "POST":
		s.handleMCP(w, r)
	default:
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(404)
		json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
	}
}
