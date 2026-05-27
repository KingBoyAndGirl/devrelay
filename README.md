# DevRelay

AI 驱动的软件交付全生命周期管理平台。通过 Agent 自动化完成从需求分析、编码、测试到 PR 创建的完整开发流程。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 (App Router) + React 18 + Tailwind CSS |
| 后端 | Next.js API Routes + 自定义 Node.js Server |
| 数据库 | SQLite (libSQL) + Drizzle ORM |
| Agent 执行 | Go Sidecar (多后端: Claude Code / Codex / Hermes / OpenClaw) |
| 实时通信 | Socket.IO |
| 认证 | NextAuth.js |

## 快速开始

```bash
# 安装依赖
npm install

# 安装 Go 并编译 Agent Sidecar（首次运行，约 1 分钟）
npm run agent:setup

# 初始化数据库（首次运行）
npm run db:migrate

# 启动开发服务器（Next.js + Go Sidecar）
npm run dev
```

> `npm run agent:setup` 会自动检测 Go 环境，未安装时自动下载安装，并编译 Sidecar 二进制。

服务启动后访问 http://localhost:3000，默认管理员账号见 `.env`。

## 项目结构

```
devrelay/
├── src/
│   ├── app/                    # Next.js App Router 页面和 API
│   │   ├── api/                # REST API 端点
│   │   └── workspaces/[slug]/ # 工作空间页面
│   ├── components/             # React 组件
│   │   └── agents/             # Agent 相关组件（Runner, 浮动对话等）
│   ├── lib/                    # 核心库
│   │   ├── agents/             # Agent 后端系统
│   │   │   ├── backends/       # CLI 后端解析器（claude, codex, hermes, openclaw）
│   │   │   ├── spawn.ts        # Agent 进程管理和流式输出
│   │   │   └── index.ts        # 公共导出
│   │   ├── db/                 # 数据库 schema 和 client
│   │   └── auth.ts             # 认证配置
│   └── devrelay/               # DevRelay CLI 入口
├── packages/
│   └── devrelay-agent/         # Go Sidecar（Agent 进程管理服务）
│       ├── main.go             # 入口
│       ├── server.go           # HTTP 服务
│       ├── claude.go           # Claude Code 后端
│       ├── codex.go            # Codex 后端
│       └── hermes.go           # Hermes 后端
├── server.ts                   # 自定义 Node.js Server（启动 Next.js + Sidecar）
├── drizzle.config.ts           # Drizzle ORM 配置
└── package.json
```

## Agent 后端架构

Agent 执行采用统一的后端接口 `AgentBackend`：

```
AgentRunner (前端) → SSE API → Go Sidecar → CLI 进程
                                    ↓
                              解析 stdout → 统一 AgentEvent
```

支持的后端：
- **Claude Code** — Anthropic 官方 CLI
- **Codex** — OpenAI Codex CLI (JSON-RPC 协议)
- **Hermes** — ACP 协议的 Agent
- **OpenClaw** — NDJSON / JSON blob 协议

## 常用命令

```bash
npm run dev          # 启动开发服务器
npm run build        # 生产构建
npm run clean        # 清理 .next 缓存并重启
npm run db:generate  # 生成数据库迁移
npm run db:migrate   # 执行数据库迁移
npm run db:studio    # 打开 Drizzle Studio
```
