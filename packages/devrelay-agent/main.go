package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

var startTime time.Time
var taskRunning sync.Map // stageId → bool

func main() {
	startTime = time.Now()

	if len(os.Args) < 2 {
		startServer()
		return
	}

	switch os.Args[1] {
	case "start":
		startServer()
	case "once":
		cmdOnce()
	case "configure", "config":
		cmdConfigure()
	case "status":
		cmdStatus()
	case "test":
		cmdTest()
	case "stop":
		cmdStop()
	case "restart":
		cmdRestart()
	case "version", "--version", "-v":
		fmt.Println("devrelay-agent@0.2.0")
	case "help", "--help", "-h":
		cmdHelp()
	default:
		startServer()
	}
}

func startServer() {
	cfg := resolveConfig()
	srv := newServer()

	mux := http.NewServeMux()
	mux.Handle("/", srv)

	addr := fmt.Sprintf(":%d", cfg.Port)

	pidDir := configDir()
	os.MkdirAll(pidDir, 0700)
	pidFile := filepath.Join(pidDir, "agent.pid")
	os.WriteFile(pidFile, []byte(strconv.Itoa(os.Getpid())), 0600)

	discoverCLIs()

	// Heartbeat + task polling
	if cfg.Token != "" && cfg.ServerURL != "" {
		go func() {
			verifyURL := cfg.ServerURL + "/api/agent/verify"
			client := &http.Client{Timeout: 10 * time.Second}

			// Immediate first poll
			pollAndExecuteTasks(client, verifyURL, cfg, srv)

			ticker := time.NewTicker(60 * time.Second)
			defer ticker.Stop()
			for range ticker.C {
				pollAndExecuteTasks(client, verifyURL, cfg, srv)
			}
		}()
	}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
		<-sigCh
		log.Println("[devrelay] shutting down...")
		if cfg.Token != "" && cfg.ServerURL != "" {
			notifyOffline(cfg)
		}
		os.Remove(pidFile)
		os.Exit(0)
	}()

	log.Printf("[devrelay] Listening on http://localhost:%d", cfg.Port)
	log.Printf("[devrelay] Auth: %v", cfg.Token != "")
	log.Printf("[devrelay] Config: %s", configFile())

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("[devrelay] Server error: %v", err)
	}
}

// ── Task types ──────────────────────────────────────────────────

type PendingTask struct {
	StageID    string            `json:"stageId"`
	IssueID    string            `json:"issueId"`
	IssueTitle string            `json:"issueTitle"`
	AgentID    string            `json:"agentId"`
	AgentType  string            `json:"agentType"`
	CLI        string            `json:"cli"`
	Prompt     string            `json:"prompt"`
	ProjectID  string            `json:"projectId"`
	TaskID     string            `json:"taskId"`
	EnvVars    map[string]string `json:"envVars"`
	ExecPath   string            `json:"execPath"`
}

type heartbeatResponse struct {
	Valid     bool          `json:"valid"`
	Workspace struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Slug string `json:"slug"`
	} `json:"workspace"`
	Tasks     []PendingTask `json:"tasks"`
	Timestamp string        `json:"timestamp"`
}

type taskResult struct {
	StageID  string `json:"stageId"`
	AgentID  string `json:"agentId"`
	ExitCode int    `json:"exitCode"`
	Output   string `json:"output"`
	Error    string `json:"error,omitempty"`
}

// ── Task polling & execution ────────────────────────────────────

func pollAndExecuteTasks(client *http.Client, verifyURL string, cfg struct {
	Port          int
	Token         string
	ServerURL     string
	MaxConcurrent int
	TimeoutMs     int
	HeartbeatMs   int
}, srv *server) {
	req, err := http.NewRequest("GET", verifyURL, nil)
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[devrelay] Heartbeat failed: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Printf("[devrelay] Heartbeat returned %d", resp.StatusCode)
		return
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return
	}

	var hb heartbeatResponse
	if err := json.Unmarshal(body, &hb); err != nil {
		log.Printf("[devrelay] Failed to parse heartbeat response: %v", err)
		return
	}

	if len(hb.Tasks) == 0 {
		return
	}

	log.Printf("[devrelay] Received %d pending task(s)", len(hb.Tasks))

	for _, task := range hb.Tasks {
		// Skip if already running
		if _, running := taskRunning.LoadOrStore(task.StageID, true); running {
			continue
		}

		go func(t PendingTask) {
			defer taskRunning.Delete(t.StageID)
			executeTask(client, cfg, srv, t)
		}(task)
	}
}

func executeTask(client *http.Client, cfg struct {
	Port          int
	Token         string
	ServerURL     string
	MaxConcurrent int
	TimeoutMs     int
	HeartbeatMs   int
}, srv *server, task PendingTask) {
	log.Printf("[devrelay] Executing task: %s (stage: %s)", task.IssueTitle, task.StageID)

	// Determine which backend to use
	backend, ok := srv.backends[task.CLI]
	if !ok {
		backend = srv.backends["claude"]
	}

	srv.limiter.acquire()
	defer srv.limiter.release()

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(cfg.TimeoutMs)*time.Millisecond)
	defer cancel()

	msgCh := make(chan Message, 256)
	resCh := make(chan Result, 1)

	go backend.Execute(ctx, task.Prompt, ExecOptions{
		EnvVars:   task.EnvVars,
		TimeoutMs: cfg.TimeoutMs,
		Cwd:       resolveCWD(),
	}, msgCh, resCh)

	var output strings.Builder
	var exitCode int
	var execErr string

	for {
		select {
		case msg := <-msgCh:
			switch msg.Type {
			case "text", "thinking", "tool_result":
				output.WriteString(msg.Text)
			case "tool_use":
				output.WriteString(fmt.Sprintf("Tool: %s\n%s\n", msg.ToolName, msg.ToolInput))
			case "error":
				execErr = msg.Text
			}

		case result := <-resCh:
			exitCode = result.ExitCode
			if result.Error != "" && execErr == "" {
				execErr = result.Error
			}
			if result.Output != "" {
				output.WriteString(result.Output)
			}
			goto done

		case <-ctx.Done():
			exitCode = -1
			execErr = "timeout"
			goto done
		}
	}

done:
	log.Printf("[devrelay] Task %s completed: exit=%d", task.StageID, exitCode)
	reportTaskResult(client, cfg, task, exitCode, output.String(), execErr)
}

func reportTaskResult(client *http.Client, cfg struct {
	Port          int
	Token         string
	ServerURL     string
	MaxConcurrent int
	TimeoutMs     int
	HeartbeatMs   int
}, task PendingTask, exitCode int, output, execErr string) {
	resultURL := cfg.ServerURL + "/api/agent/task-result"
	payload := taskResult{
		StageID:  task.StageID,
		AgentID:  task.AgentID,
		ExitCode: exitCode,
		Output:   output,
		Error:    execErr,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", resultURL, bytes.NewReader(body))
	if err != nil {
		log.Printf("[devrelay] Failed to create result request: %v", err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[devrelay] Failed to report result: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		log.Printf("[devrelay] Result reported for stage %s (exit=%d)", task.StageID, exitCode)
	} else {
		log.Printf("[devrelay] Result report returned %d for stage %s", resp.StatusCode, task.StageID)
	}
}

// ── Once mode (single poll cycle) ───────────────────────────────

func cmdOnce() {
	cfg := resolveConfig()
	if cfg.Token == "" || cfg.ServerURL == "" {
		fmt.Println("[devrelay] No server URL or token configured. Run: devrelay configure")
		os.Exit(1)
	}

	srv := newServer()
	client := &http.Client{Timeout: 10 * time.Second}
	verifyURL := cfg.ServerURL + "/api/agent/verify"

	log.Println("[devrelay] Running once: polling for tasks...")
	pollAndExecuteTasks(client, verifyURL, cfg, srv)

	// Wait for all tasks to complete
	time.Sleep(500 * time.Millisecond)
	counter := 0
	for {
		running := false
		taskRunning.Range(func(_, _ interface{}) bool {
			running = true
			return false
		})
		if !running {
			break
		}
		time.Sleep(time.Second)
		counter++
		if counter > 600 {
			log.Println("[devrelay] Timeout waiting for tasks to complete")
			break
		}
	}

	log.Println("[devrelay] Once cycle complete")
}

func discoverCLIs() []string {
	knownCLIs := []string{"claude", "codex", "copilot", "openclaw", "opencode", "hermes", "gemini", "pi", "cursor-agent", "kimi", "kiro-cli"}
	var found []string
	for _, bin := range knownCLIs {
		if _, err := exec.LookPath(bin); err == nil {
			found = append(found, bin)
		}
	}
	log.Printf("[devrelay] Detected CLIs: %s", strings.Join(found, ", "))
	return found
}

func notifyOffline(cfg struct {
	Port          int
	Token         string
	ServerURL     string
	MaxConcurrent int
	TimeoutMs     int
	HeartbeatMs   int
}) {
	client := &http.Client{Timeout: 5 * time.Second}
	req, _ := http.NewRequest("POST", cfg.ServerURL+"/api/agent/disconnect", nil)
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	client.Do(req)
}

func cmdConfigure() {
	cfg := loadConfig()

	args := os.Args[2:]
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--token":
			if i+1 < len(args) {
				cfg.Token = args[i+1]
				i++
			}
		case "--url":
			if i+1 < len(args) {
				cfg.ServerURL = args[i+1]
				i++
			}
		case "--port":
			if i+1 < len(args) {
				cfg.Port, _ = strconv.Atoi(args[i+1])
				i++
			}
		}
	}
	saveConfig(cfg)
	fmt.Printf("[devrelay] Configuration saved to %s\n", configFile())
	if cfg.Token != "" {
		fmt.Printf("  Token:    %s...\n", cfg.Token[:min(8, len(cfg.Token))])
	}
	if cfg.ServerURL != "" {
		fmt.Printf("  Server:   %s\n", cfg.ServerURL)
	}
}

func cmdStatus() {
	cfg := resolveConfig()
	fmt.Println("\n  DevRelay Agent Status")
	fmt.Println("  ────────────────────")
	fmt.Printf("  Version:      0.2.0\n")
	fmt.Printf("  Config:       %s\n", configFile())
	fmt.Printf("  Port:         %d\n", cfg.Port)
	if cfg.Token != "" {
		fmt.Printf("  Token:        %s...\n", cfg.Token[:min(8, len(cfg.Token))])
	} else {
		fmt.Println("  Token:        (not set)")
	}
	if cfg.ServerURL != "" {
		fmt.Printf("  Server URL:   %s\n", cfg.ServerURL)
	} else {
		fmt.Println("  Server URL:   (not set)")
	}
	fmt.Printf("  Max concurrent: %d\n", cfg.MaxConcurrent)
	fmt.Printf("  Timeout:      %ds\n\n", cfg.TimeoutMs/1000)

	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://localhost:%d/health", cfg.Port))
	if err == nil {
		defer resp.Body.Close()
		fmt.Println("  Status:       RUNNING")
	} else {
		fmt.Println("  Status:       STOPPED")
	}
	fmt.Println()
	discoverCLIs()
	fmt.Println()
}

func cmdTest() {
	cfg := resolveConfig()
	if cfg.ServerURL == "" || cfg.Token == "" {
		fmt.Println("[devrelay] No server URL or token configured. Run: devrelay configure")
		return
	}

	client := &http.Client{Timeout: 5 * time.Second}
	req, _ := http.NewRequest("GET", cfg.ServerURL+"/api/agent/verify", nil)
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("[devrelay] Connection failed: %v\n", err)
		return
	}
	defer resp.Body.Close()
	fmt.Printf("[devrelay] Connection successful (HTTP %d)\n", resp.StatusCode)
}

func cmdRestart() {
	cfg := resolveConfig()
	client := &http.Client{Timeout: 5 * time.Second}
	req, _ := http.NewRequest("POST", cfg.ServerURL+"/api/agent/disconnect", nil)
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	client.Do(req)

	exe, _ := os.Executable()
	cmd := exec.Command(exe, "start")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Start()
	os.Exit(0)
}

func cmdStop() {
	cfg := resolveConfig()
	notifyOffline(cfg)

	pidDir := configDir()
	pidFile := filepath.Join(pidDir, "agent.pid")
	data, err := os.ReadFile(pidFile)
	if err != nil {
		fmt.Println("[devrelay] No agent process found")
		return
	}
	pid, _ := strconv.Atoi(strings.TrimSpace(string(data)))
	if pid > 0 {
		proc, _ := os.FindProcess(pid)
		if proc != nil {
			proc.Signal(syscall.SIGTERM)
			fmt.Printf("[devrelay] Stopped agent (pid %d)\n", pid)
		}
	}
	os.Remove(pidFile)
}

func cmdHelp() {
	fmt.Print(`
  DevRelay Agent — AI CLI execution sidecar

  Usage:
    devrelay [command] [options]

  Commands:
    start               Start the agent server (default)
    once                Poll for tasks once and exit
    stop                Stop the running agent
    restart             Restart the agent server
    configure           Setup (token, server URL, port)
    status              Show configuration and health
    test                Test connection to DevRelay server
    version             Show version
    help                Show this help

  Configure options:
    --token <string>    Agent authentication token
    --url <string>      DevRelay server URL
    --port <number>     Agent listening port (default: 4100)

  Config file: ~/.devrelay/agent.json
`)
}

func buildRealEnv(extra map[string]string) []string {
	env := os.Environ()
	if len(extra) == 0 {
		return env
	}
	envMap := make(map[string]string)
	for _, e := range env {
		kv := strings.SplitN(e, "=", 2)
		if len(kv) == 2 {
			envMap[kv[0]] = kv[1]
		}
	}
	for k, v := range extra {
		envMap[k] = v
	}
	var result []string
	for k, v := range envMap {
		result = append(result, k+"="+v)
	}
	return result
}

func resolveCWD() string {
	cwd, _ := os.Getwd()
	return cwd
}

func buildEnv(extra map[string]string) []string {
	return buildRealEnv(extra)
}

func notifyOfflineSimple(url, token string) {
	client := &http.Client{Timeout: 3 * time.Second}
	req, _ := http.NewRequest("POST", url+"/api/agent/disconnect", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	client.Do(req)
}
