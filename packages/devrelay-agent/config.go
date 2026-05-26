package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
)

type AgentConfig struct {
	Token         string `json:"token,omitempty"`
	ServerURL     string `json:"serverUrl,omitempty"`
	Port          int    `json:"port,omitempty"`
	MaxConcurrent int    `json:"maxConcurrent,omitempty"`
	TimeoutMs     int    `json:"timeoutMs,omitempty"`
	HeartbeatMs   int    `json:"heartbeatMs,omitempty"`
}

func configDir() string {
	d := os.Getenv("DEVRELAY_CONFIG_DIR")
	if d != "" {
		return d
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".devrelay")
}

func configFile() string {
	return filepath.Join(configDir(), "agent.json")
}

func loadConfig() AgentConfig {
	var cfg AgentConfig
	data, err := os.ReadFile(configFile())
	if err != nil {
		return cfg
	}
	json.Unmarshal(data, &cfg)
	return cfg
}

func saveConfig(cfg AgentConfig) {
	os.MkdirAll(configDir(), 0700)
	data, _ := json.MarshalIndent(cfg, "", "  ")
	os.WriteFile(configFile(), append(data, '\n'), 0600)
}

func resolveConfig() struct {
	Port          int
	Token         string
	ServerURL     string
	MaxConcurrent int
	TimeoutMs     int
	HeartbeatMs   int
} {
	cfg := loadConfig()
	return struct {
		Port          int
		Token         string
		ServerURL     string
		MaxConcurrent int
		TimeoutMs     int
		HeartbeatMs   int
	}{
		Port:          intEnv("DEVRELAY_AGENT_PORT", cfg.Port, 4100),
		Token:         strEnv("DEVRELAY_AGENT_TOKEN", cfg.Token),
		ServerURL:     strEnv("DEVRELAY_AGENT_URL", cfg.ServerURL),
		MaxConcurrent: intEnv("DEVRELAY_AGENT_MAX_CONCURRENT", cfg.MaxConcurrent, 3),
		TimeoutMs:     intEnv("DEVRELAY_AGENT_TIMEOUT", cfg.TimeoutMs, 600000),
		HeartbeatMs:   intEnv("DEVRELAY_AGENT_HEARTBEAT", cfg.HeartbeatMs, 120000),
	}
}

func intEnv(key string, cfgVal int, defaultVal int) int {
	s := os.Getenv(key)
	if s != "" {
		v, err := strconv.Atoi(s)
		if err == nil {
			return v
		}
	}
	if cfgVal != 0 {
		return cfgVal
	}
	return defaultVal
}

func strEnv(key, cfgVal string) string {
	s := os.Getenv(key)
	if s != "" {
		return s
	}
	return cfgVal
}
