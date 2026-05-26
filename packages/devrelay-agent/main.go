package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var startTime time.Time

func main() {
	startTime = time.Now()

	if len(os.Args) < 2 {
		startServer()
		return
	}

	switch os.Args[1] {
	case "start":
		startServer()
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

	// PID file
	pidDir := configDir()
	os.MkdirAll(pidDir, 0700)
	pidFile := filepath.Join(pidDir, "agent.pid")
	os.WriteFile(pidFile, []byte(strconv.Itoa(os.Getpid())), 0600)

	// Discover CLIs
	discoverCLIs()

	// Heartbeat to server
	if cfg.Token != "" && cfg.ServerURL != "" {
		go func() {
			verifyURL := cfg.ServerURL + "/api/agent/verify"
			client := &http.Client{Timeout: 5 * time.Second}
			req, _ := http.NewRequest("GET", verifyURL, nil)
			req.Header.Set("Authorization", "Bearer "+cfg.Token)
			client.Do(req) // immediate

			ticker := time.NewTicker(60 * time.Second)
			defer ticker.Stop()
			for range ticker.C {
				req, _ := http.NewRequest("GET", verifyURL, nil)
				req.Header.Set("Authorization", "Bearer "+cfg.Token)
				client.Do(req)
			}
		}()
	}

	// Graceful shutdown
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

	// Non-interactive: just save what's passed
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

	// Check if running
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
	// Try to stop
	req, _ := http.NewRequest("POST", cfg.ServerURL+"/api/agent/disconnect", nil)
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	client.Do(req)

	// Re-exec self
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

// Re-declare buildEnv to use os.Environ properly
func buildEnv(extra map[string]string) []string {
	return buildRealEnv(extra)
}

func notifyOfflineSimple(url, token string) {
	client := &http.Client{Timeout: 3 * time.Second}
	req, _ := http.NewRequest("POST", url+"/api/agent/disconnect", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	client.Do(req)
}
