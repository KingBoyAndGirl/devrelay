#!/usr/bin/env bash
set -euo pipefail

# DevRelay Agent — One-click install script
# Usage: curl -fsSL https://raw.githubusercontent.com/KingBoyAndGirl/devrelay/main/scripts/install-agent.sh | bash

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[devrelay]${NC} $*"; }
warn()  { echo -e "${YELLOW}[devrelay]${NC} $*"; }
error() { echo -e "${RED}[devrelay]${NC} $*"; exit 1; }

# ── Check prerequisites ──────────────────────────────────────────

check_node() {
  if ! command -v node &>/dev/null; then
    error "Node.js not found. Install Node.js 18+ first: https://nodejs.org"
  fi

  local major
  major=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$major" -lt 18 ]; then
    error "Node.js $major detected, but 18+ is required. Please upgrade."
  fi

  info "Node.js $(node -v) ✓"
}

check_npm() {
  if ! command -v npm &>/dev/null; then
    error "npm not found. It usually comes with Node.js."
  fi
  info "npm $(npm -v) ✓"
}

# ── Install ──────────────────────────────────────────────────────

install_agent() {
  info "Installing devrelay-agent globally..."
  npm install -g devrelay-agent 2>/dev/null || {
    warn "Global install failed, trying with sudo..."
    sudo npm install -g devrelay-agent
  }
  info "devrelay installed ✓"
}

# ── Detect AI CLIs ───────────────────────────────────────────────

detect_clis() {
  info "Detecting AI CLI tools on this machine..."
  local found=0
  local clis=("claude" "codex" "copilot" "hermes" "gemini" "cursor-agent")

  for cli in "${clis[@]}"; do
    if command -v "$cli" &>/dev/null; then
      local ver
      ver=$("$cli" --version 2>&1 | head -1 | cut -c1-40 || echo "installed")
      echo -e "  ${GREEN}✓${NC} $cli  ($ver)"
      ((found++))
    else
      echo -e "  ${YELLOW}○${NC} $cli  (not installed)"
    fi
  done

  if [ "$found" -eq 0 ]; then
    warn "No AI CLI tools detected. Install at least one (e.g. claude, codex) to use DevRelay."
  else
    info "Found $found AI CLI tool(s) ✓"
  fi
}

# ── Generate auth token ──────────────────────────────────────────

generate_token() {
  local token_file="$HOME/.devrelay-token"
  if [ -f "$token_file" ]; then
    AGENT_TOKEN=$(cat "$token_file")
    info "Using existing token from $token_file"
  else
    AGENT_TOKEN=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')
    echo "$AGENT_TOKEN" > "$token_file"
    chmod 600 "$token_file"
    info "Generated new auth token -> $token_file"
  fi
  echo ""
  echo -e "  ${BOLD}Add this to your DevRelay server environment:${NC}"
  echo -e "  DEVRELAY_AGENT_TOKEN=${AGENT_TOKEN}"
  echo ""
}

# ── Systemd service (optional) ───────────────────────────────────

setup_systemd() {
  if [ "$(uname)" != "Linux" ]; then
    info "Skipping systemd setup (not Linux)."
    return
  fi

  if ! command -v systemctl &>/dev/null; then
    info "Skipping systemd setup (systemctl not found)."
    return
  fi

  read -rp "$(echo -e "${BOLD}Install as systemd service? [y/N]: ${NC}")" answer
  if [[ ! "$answer" =~ ^[Yy]$ ]]; then
    info "Skipped. Start manually with: DEVRELAY_AGENT_TOKEN=\$AGENT_TOKEN devrelay"
    return
  fi

  local agent_bin
  agent_bin=$(command -v devrelay)

  sudo tee /etc/systemd/system/devrelay.service > /dev/null <<EOF
[Unit]
Description=DevRelay Agent — AI CLI execution sidecar
After=network.target

[Service]
Type=simple
ExecStart=${agent_bin}
Restart=on-failure
RestartSec=5
Environment=DEVRELAY_AGENT_PORT=4100
Environment=DEVRELAY_AGENT_MAX_CONCURRENT=3
Environment=DEVRELAY_AGENT_TOKEN=${AGENT_TOKEN}

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable devrelay
  sudo systemctl start devrelay

  info "devrelay service installed and started ✓"
  echo -e "  Check status: ${BOLD}systemctl status devrelay${NC}"
  echo -e "  View logs:    ${BOLD}journalctl -u devrelay -f${NC}"
}

# ── Print summary ────────────────────────────────────────────────

print_summary() {
  echo ""
  echo -e "${BOLD}══════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  DevRelay Agent installed successfully!${NC}"
  echo -e "${BOLD}══════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  Start:        ${BOLD}devrelay${NC}"
  echo -e "  Health check: ${BOLD}curl http://localhost:4100/health${NC}"
  echo -e "  Discover CLIs:${BOLD}curl http://localhost:4100/discover${NC}"
  echo ""
  echo -e "  Environment variables:"
  echo -e "    DEVRELAY_AGENT_PORT=4100          (default port)"
  echo -e "    DEVRELAY_AGENT_MAX_CONCURRENT=3   (max parallel agents)"
  echo -e "    DEVRELAY_AGENT_TIMEOUT=600000     (execution timeout ms)"
  echo ""
  echo -e "  Connect to DevRelay server:"
  echo -e "    Set ${BOLD}DEVRELAY_AGENT_URL=http://<this-host>:4100${NC}"
  echo -e "    in your DevRelay server's environment."
  echo ""
}

# ── Main ─────────────────────────────────────────────────────────

main() {
  echo ""
  echo -e "${BOLD}DevRelay Agent Installer${NC}"
  echo -e "AI CLI execution sidecar for DevRelay"
  echo ""

  check_node
  check_npm
  echo ""
  install_agent
  echo ""
  detect_clis
  echo ""
  generate_token
  setup_systemd
  print_summary
}

main "$@"
