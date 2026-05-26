#!/bin/sh
set -e

echo "  DevRelay Agent Installer"
echo "  ───────────────────────"

BIN_DIR="${BIN_DIR:-/usr/local/bin}"
INSTALL_PATH="${BIN_DIR}/devrelay"

# Check if Go is available
if command -v go >/dev/null 2>&1; then
  echo "  Installing via go install..."
  go install github.com/KingBoyAndGirl/devrelay/packages/devrelay-agent@latest
  echo "  Done: $(go env GOPATH)/bin/devrelay"
  echo ""
  echo "  Add to PATH or symlink:"
  echo "  sudo ln -sf $(go env GOPATH)/bin/devrelay ${INSTALL_PATH}"
else
  echo "  Go not found. Downloading pre-built binary..."
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64)  GOARCH="amd64" ;;
    aarch64) GOARCH="arm64" ;;
    *)       echo "  Unsupported arch: $ARCH"; exit 1 ;;
  esac

  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  VERSION="v0.2.0"
  URL="https://github.com/KingBoyAndGirl/devrelay/releases/download/${VERSION}/devrelay-${OS}-${GOARCH}"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$URL" -o /tmp/devrelay
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$URL" -O /tmp/devrelay
  else
    echo "  Need curl or wget to download binary"
    exit 1
  fi

  chmod +x /tmp/devrelay
  sudo mv /tmp/devrelay "${INSTALL_PATH}" 2>/dev/null || {
    echo "  sudo not available, installing to ~/.local/bin"
    mkdir -p ~/.local/bin
    mv /tmp/devrelay ~/.local/bin/devrelay
    INSTALL_PATH=~/.local/bin/devrelay
  }
  echo "  Done: ${INSTALL_PATH}"
fi

echo ""
echo "  Next steps:"
echo "    devrelay configure --token <token> --url <server-url>"
echo "    devrelay start"
