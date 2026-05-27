#!/usr/bin/env bash
set -euo pipefail

# DevRelay Agent (Go Sidecar) 安装脚本
# 用法: bash scripts/setup-agent.sh

GO_VERSION="1.24.3"
GO_INSTALL_DIR="$HOME/go"
AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)/packages/devrelay-agent"
BINARY_NAME="devrelay"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ── 1. 检查/安装 Go ─────────────────────────────────────────────

check_go() {
  if command -v go &>/dev/null; then
    local current
    current=$(go version | grep -oP '\d+\.\d+\.\d+' || true)
    if [ "$current" = "$GO_VERSION" ]; then
      info "Go $GO_VERSION 已安装"
      return 0
    else
      warn "Go 版本不匹配: 当前 $current, 需要 $GO_VERSION"
      return 1
    fi
  fi
  return 1
}

install_go() {
  local arch
  arch=$(uname -m)
  case "$arch" in
    x86_64)  arch="amd64" ;;
    aarch64) arch="arm64" ;;
    armv7l)  arch="armv6l" ;;
    *)       error "不支持的架构: $arch" ;;
  esac

  local os
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  case "$os" in
    linux)  os="linux" ;;
    darwin) os="darwin" ;;
    *)      error "不支持的操作系统: $os" ;;
  esac

  local tarball="go${GO_VERSION}.${os}-${arch}.tar.gz"
  local url="https://go.dev/dl/${tarball}"

  echo "下载 Go ${GO_VERSION} (${os}/${arch})..."
  local tmp
  tmp=$(mktemp -d)
  curl -fsSL "$url" -o "$tmp/$tarball" || error "下载失败，请检查网络连接"

  echo "安装 Go 到 ${GO_INSTALL_DIR}..."
  rm -rf "$GO_INSTALL_DIR"
  tar -C "$(dirname "$GO_INSTALL_DIR")" -xzf "$tmp/$tarball"
  rm -rf "$tmp"

  # 写入 PATH
  local profile
  for profile in "$HOME/.bashrc" "$HOME/.profile" "$HOME/.bash_profile"; do
    if [ -f "$profile" ]; then
      if ! grep -q "$GO_INSTALL_DIR/bin" "$profile"; then
        echo "export PATH=\$PATH:$GO_INSTALL_DIR/bin" >> "$profile"
      fi
    fi
  done
  export PATH="$PATH:$GO_INSTALL_DIR/bin"

  info "Go $GO_VERSION 安装完成"
}

# ── 2. 编译 Agent ──────────────────────────────────────────────

build_agent() {
  if [ ! -d "$AGENT_DIR" ]; then
    error "未找到 Agent 目录: $AGENT_DIR"
  fi

  echo "编译 devrelay-agent..."
  cd "$AGENT_DIR"

  # 下载依赖
  "$GO_INSTALL_DIR/bin/go" mod tidy 2>&1 || true

  # 编译
  "$GO_INSTALL_DIR/bin/go" build -o "$BINARY_NAME" . || error "编译失败"

  # 验证
  if [ -x "$BINARY_NAME" ]; then
    info "编译成功: $AGENT_DIR/$BINARY_NAME"
    echo ""
    echo "二进制信息:"
    ./"$BINARY_NAME" --help 2>&1 | head -5 || ./"$BINARY_NAME" version 2>&1 || true
  else
    error "编译产物不存在"
  fi
}

# ── 3. 验证环境 ────────────────────────────────────────────────

verify() {
  echo ""
  info "环境检查通过"
  echo ""
  echo "Go:     $(go version)"
  echo "Binary: $AGENT_DIR/$BINARY_NAME"
  echo "Size:   $(du -sh "$AGENT_DIR/$BINARY_NAME" | cut -f1)"
  echo ""
  echo "运行 'npm run dev' 启动服务"
}

# ── 主流程 ─────────────────────────────────────────────────────

echo "=============================="
echo " DevRelay Agent 安装脚本"
echo "=============================="
echo ""

if ! check_go; then
  install_go
fi

build_agent
verify
