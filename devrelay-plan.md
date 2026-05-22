# DevRelay - AI 驱动的软件交付生命周期管理平台

## 项目概述

DevRelay 是一个面向软件交付团队的 Web 平台，将完整的软件开发交付流程（需求→设计→开发→测试→部署→交付）数字化、自动化。

**设计原则**：
- **All in One**：单个进程运行，无需外部依赖（无 Redis、无独立数据库服务、无对象存储），部署只需 Node.js + 一个 SQLite 文件 + 一个文档目录
- **文档即 Markdown 文件**：PRD、技术方案、评审报告等一律存储为 `.md` 文件，轻量、可 Git 版本控制、可直接用编辑器打开修改

**核心能力**：
- 以**空间（Workspace）**组织多仓库（前端/后端等）和多交付项目
- 对接 GitHub（Issue / PR / Commit / Branch / Webhook），实现代码与流程双向联动
- 接入多种 AI 智能体（Claude Code、Codex、Hermes、OpenClaw 等），Agent 可按空间共享或项目独享
- 为每个角色（PM、架构师、开发、QA）配备 AI 助手，实现人机协作的交付闭环

## 核心概念层级

```
Company（公司/组织）
 └── Workspace（空间）          ← 产品/团队层级，如「电商平台」
      ├── Repositories（仓库）   ← 前端仓库、后端仓库、移动端仓库...
      ├── Projects（交付项目）   ← 每次客户交付为一个 Project
      ├── Agent Pool（智能体池） ← 空间共享 OR 项目独享
      └── Members（成员）        ← 空间内角色分配
```

**关系说明**：
- 一个 Workspace 可以包含 **多个 Repository**（如 frontend + backend）
- 一个 Workspace 可以创建 **多个 Project**（每个 Project 走完整的 13 步流程）
- 一个 Project 可以关联 **多个 Repository**（全栈项目同时改前后端）
- Agent 在 Workspace 层级注册，可选择 **共享**（所有 Project 可用）或 **独享**（仅指定 Project 可用）

## 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端 + 后端 | Next.js 14 (App Router) + TypeScript + Tailwind CSS | 全栈一体，一个进程搞定 |
| 数据库 | SQLite + Drizzle ORM | 零配置单文件数据库，all in one 核心 |
| 实时通信 | WebSocket (Socket.io) | 流程状态实时推送，内置于 Next.js |
| 认证 | NextAuth.js + RBAC | 内置认证，SQLite 适配 |
| GitHub 对接 | Octokit (REST + GraphQL) + Webhook | Issue/PR/Commit 管理 |
| AI Agent 集成 | Plugin 架构 + REST 适配器 | 统一接入各智能体 |
| 异步任务 | 内置简单任务队列（基于 SQLite 轮询） | 无需 Redis |
| 文件存储 | **本地 .md 文件** | PRD、技术方案、评审报告等全部保存为 Markdown 文件 |
| 部署 | `npx next start` 或单容器 Docker | 一个进程，一个端口 |

## 系统架构

```
┌──────────────────────────────────────────────────────────────────┐
│               DevRelay (Custom Server 单进程)                     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    Web UI (React)                           │  │
│  │  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │  │
│  │  │ PM 视图  │ 架构师   │ 开发视图 │ QA 视图  │ 交付经理 │  │  │
│  │  └──────────┴──────────┴──────────┴──────────┴──────────┘  │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │              API + 流程引擎 (tRPC)                          │  │
│  │  ┌────────┬────────┬──────────┬──────────┬──────────────┐  │  │
│  │  │空间管理│用户认证│ 流程引擎 │GitHub集成│Agent调度(CLI)│  │  │
│  │  └────────┴────────┴──────────┴──────────┴──────────────┘  │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │  SQLite    │  .md 文档  │  Socket.io  │  Agent spawn      │  │
│  │  (单文件)  │  目录      │  (WebSocket) │  (子进程流式)     │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## 角色定义

| 角色 | 职责 | 可用 Agent 示例 | 权限范围 |
|------|------|----------------|---------|
| **PM** | 需求收集、PRD编写、原型设计、验收评审 | 需求分析Agent、文档生成Agent | 需求→原型→验收 |
| **架构师** | 技术方案设计、方案评审、代码评审、技术验收 | 架构审查Agent、代码分析Agent | 技术方案→代码评审 |
| **开发** | 任务执行、编码实现、提交代码 | 编码Agent（Claude Code/Codex） | 开发阶段 |
| **QA** | 测试用例、功能测试、回归测试 | 测试Agent | 测试阶段 |
| **交付经理** | 全流程管控、部署发布、客户交付 | 全流程Agent | 全局 |

## 13 步流程与状态机

```
[1.需求收集] → [2.PRD编写] → [3.原型设计] → [4.技术方案]
     ↓                                              ↓
[5.方案评审] ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←← 驳回循环
     ↓ (通过)
[6.任务拆分] → [7.开发实现] → [8.代码评审]
                                   ↓ (通过)
[9.测试] → [10.验收评审] → [11.部署发布] → [12.交付验收]
                                              ↓
                         [13.线上监控与反馈] ←── 闭环
```

每个步骤三种状态：`pending` → `in_progress` → `completed` / `rejected`
- `rejected` 携带评审意见回退到上一步
- `completed` 自动解锁下一步

## 用户认证体系

### 登录方式

内置用户名 + 密码登录（NextAuth.js Credentials Provider），密码 bcrypt 加密存储。

### 多用户模型

- 每个用户可创建自己的 Workspace（自动成为该空间 Admin）
- 用户可通过**邀请链接**或**邀请码**邀请其他用户加入空间
- 管理员用户可查看和管理所有空间和用户
- 初始管理员账号通过环境变量 `ADMIN_USER` / `ADMIN_PASS` 在首次启动时自动创建

### User 表

```typescript
export const users = sqliteTable('users', {
  id:            text('id').primaryKey(),
  username:      text('username').notNull().unique(),
  passwordHash:  text('password_hash').notNull(),        // bcrypt
  displayName:   text('display_name'),
  isAdmin:       integer('is_admin', { mode: 'boolean' }).default(false),
  createdAt:     text('created_at').notNull(),
  updatedAt:     text('updated_at').notNull(),
});
```

### Workspace 邀请

```typescript
export const invitations = sqliteTable('invitations', {
  id:          text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  code:        text('code').notNull().unique(),          // 邀请码，如 "devrelay-abc123"
  createdBy:   text('created_by').notNull(),             // 发起人 userId
  role:        text('role').notNull().default('developer'),
  usedBy:      text('used_by'),                          // 接受人 userId
  expiresAt:   text('expires_at'),
  createdAt:   text('created_at').notNull(),
});
```

### 通知模型

```typescript
export const notifications = sqliteTable('notifications', {
  id:            text('id').primaryKey(),
  userId:        text('user_id').notNull(),              // 接收人
  title:         text('title').notNull(),
  message:       text('message'),
  type:          text('type').notNull(),                 // stage_assigned / stage_rejected / stage_approved / task_assigned / pr_opened / comment
  isRead:        integer('is_read', { mode: 'boolean' }).default(false),
  projectId:     text('project_id'),                     // 关联项目
  stageId:       text('stage_id'),                       // 关联阶段
  taskId:        text('task_id'),                        // 关联任务
  createdAt:     text('created_at').notNull(),
});
```

通知规则：流程中每个阶段的 `assignedTo` 角色对应成员 → 阶段状态变更 → 自动创建通知记录 → WebSocket 实时推送。

### WorkspaceMember 更新

```typescript
// 原 workspaceMembers 表增加 invite 相关字段即可
// userId 在邀请接受前可为空
```

---

## 技术实现要点

### WebSocket 实现：Custom Server

Next.js App Router 不原生支持 WebSocket，采用 custom server 包装方案：

```typescript
// server.ts — 入口文件，替代 npx next start
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import next from 'next';
import { setupWorkflowNotifier } from './src/lib/notify';

const app = next({ dev: process.env.NODE_ENV !== 'production' });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(handle);
  const io = new SocketIOServer(server);

  io.on('connection', (socket) => {
    // 用户加入自己的通知频道
    socket.on('subscribe', (userId: string) => {
      socket.join(`user:${userId}`);
    });
  });

  // 挂载 io 供 API 路由使用
  globalThis.io = io;
  setupWorkflowNotifier(io);  // 阶段变更 → 推送通知

  server.listen(3000);
});
```

### Agent CLI 通信方案

Claude Code、Codex 等是 CLI 工具，通过 Node.js 子进程方式调用：

```typescript
// src/lib/agents/spawn.ts
import { spawn } from 'child_process';

interface AgentSpawnConfig {
  execPath: string;        // CLI 可执行文件路径，如 "/usr/bin/claude"
  argsTemplate: string;    // 参数模板，如 '-p "{prompt}" --output-format stream-json'
  env: Record<string, string>;  // 环境变量（API key 等）
  cwd?: string;            // 工作目录（项目仓库路径）
}

async function runAgent(config: AgentSpawnConfig, prompt: string): Promise<ReadableStream> {
  const args = config.argsTemplate
    .replace('{prompt}', prompt)
    .split(' ');
  
  const child = spawn(config.execPath, args, {
    env: { ...process.env, ...config.env },
    cwd: config.cwd,
  });

  // 流式返回 stdout，支持实时展示
  return child.stdout;
}
```

Agent 适配器只需提供 `execPath` + `argsTemplate` + `env`，通过 `child_process.spawn` 拉起，stdout 流式输出。长任务走 SQLite 内置队列异步执行。

### 原型图在 Markdown 中的处理

原型图可以多种方式嵌入 `.md` 文件：

1. **ASCII 线框图**（简单交互直接画）
   ```
   ┌──────────┐  点击「提交」  ┌──────────┐
   │ 订单列表  │ ────────────→ │ 订单详情  │
   └──────────┘               └──────────┘
   ```

2. **外部链接**（Figma / 设计稿 URL）
   ```markdown
   [原型图 - Figma](https://figma.com/file/xxx)
   ```

3. **本地图片**（截图放在 `docs/images/` 目录）
   ```markdown
   ![登录页原型](images/login-prototype.png)
   ```

原型图 `.md` 文件名称：`03-prototype-v1.md`

```typescript
export const workspaces = sqliteTable('workspaces', {
  id:          text('id').primaryKey(),         // cuid
  name:        text('name').notNull(),
  slug:        text('slug').notNull().unique(), // URL 友好标识
  description: text('description'),
  createdAt:   text('created_at').notNull(),    // ISO 8601
  updatedAt:   text('updated_at').notNull(),
});
```

### Repository（仓库，关联 GitHub）

```typescript
export const repositories = sqliteTable('repositories', {
  id:            text('id').primaryKey(),
  workspaceId:   text('workspace_id').notNull().references(() => workspaces.id),
  name:          text('name').notNull(),             // "frontend"、"backend"
  provider:      text('provider').notNull().default('github'),
  remoteUrl:     text('remote_url').notNull(),       // https://github.com/org/repo.git
  accessToken:   text('access_token'),              // OAuth 获取的 token（加密存储）
  tokenExpiresAt:text('token_expires_at'),           // token 过期时间
  refreshToken:  text('refresh_token'),              // 刷新 token
  defaultBranch: text('default_branch').default('main'),
  webhookSecret: text('webhook_secret'),
  createdAt:     text('created_at').notNull(),
  updatedAt:     text('updated_at').notNull(),
});
```

### GitHub Issue / Pull Request / LinkedCommit

```typescript
export const githubIssues = sqliteTable('github_issues', {
  id:            text('id').primaryKey(),
  repositoryId:  text('repository_id').notNull().references(() => repositories.id),
  issueNumber:   integer('issue_number').notNull(),
  title:         text('title').notNull(),
  body:          text('body'),
  state:         text('state').default('open'),      // open / closed
  labels:        text('labels'),                      // JSON 数组
  assignees:     text('assignees'),                   // JSON 数组
  devrelayTaskId: text('devrelay_task_id'),
  syncedAt:      text('synced_at').notNull(),
  createdAt:     text('created_at').notNull(),
  updatedAt:     text('updated_at').notNull(),
});

export const pullRequests = sqliteTable('pull_requests', {
  id:             text('id').primaryKey(),
  repositoryId:   text('repository_id').notNull().references(() => repositories.id),
  prNumber:       integer('pr_number').notNull(),
  title:          text('title').notNull(),
  body:           text('body'),
  state:          text('state').default('open'),      // open / closed / merged
  sourceBranch:   text('source_branch'),
  targetBranch:   text('target_branch'),
  commitSha:      text('commit_sha'),
  devrelayTaskId:  text('devrelay_task_id'),
  devrelayStageId: text('devrelay_stage_id'),
  createdAt:      text('created_at').notNull(),
  updatedAt:      text('updated_at').notNull(),
});

export const linkedCommits = sqliteTable('linked_commits', {
  id:           text('id').primaryKey(),
  repositoryId: text('repository_id').notNull().references(() => repositories.id),
  sha:          text('sha').notNull(),
  message:      text('message'),
  author:       text('author'),
  branch:       text('branch'),
  taskId:       text('task_id'),
  projectId:    text('project_id'),
  createdAt:    text('created_at').notNull(),
});
```

### Project（交付项目）

```typescript
export const projects = sqliteTable('projects', {
  id:          text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  name:        text('name').notNull(),
  description: text('description'),
  customer:    text('customer'),                     // 客户名称
  status:      text('status').notNull().default('active'), // active / completed / archived
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
});

export const projectRepos = sqliteTable('project_repos', {
  id:           text('id').primaryKey(),
  projectId:    text('project_id').notNull().references(() => projects.id),
  repositoryId: text('repository_id').notNull().references(() => repositories.id),
});
```

### Stage / Document / Task

```typescript
export const stages = sqliteTable('stages', {
  id:          text('id').primaryKey(),
  projectId:   text('project_id').notNull().references(() => projects.id),
  step:        integer('step').notNull(),             // 1-13
  name:        text('name').notNull(),
  status:      text('status').notNull().default('pending'), // pending / in_progress / completed / rejected
  assignedTo:  text('assigned_to'),                  // 负责角色
  reviewNotes: text('review_notes'),
  startedAt:   text('started_at'),
  completedAt: text('completed_at'),
});

// 文档元数据存 SQLite，内容存 .md 文件
export const documents = sqliteTable('documents', {
  id:          text('id').primaryKey(),
  projectId:   text('project_id').notNull().references(() => projects.id),
  type:        text('type').notNull(),               // prd / prototype / tech_design / ...
  title:       text('title').notNull(),
  filePath:    text('file_path').notNull(),           // 相对路径，如 "projects/{id}/docs/prd-v1.md"
  version:     integer('version').default(1),
  createdBy:   text('created_by'),
  stageId:     text('stage_id'),
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
});

export const tasks = sqliteTable('tasks', {
  id:            text('id').primaryKey(),
  projectId:     text('project_id').notNull().references(() => projects.id),
  title:         text('title').notNull(),
  description:   text('description'),
  status:        text('status').notNull().default('todo'), // todo / in_progress / in_review / done
  priority:      text('priority').default('medium'),       // low / medium / high / critical
  assignedTo:    text('assigned_to'),
  stageId:       text('stage_id'),
  agentId:       text('agent_id'),
  repositoryId:  text('repository_id'),
  gitBranch:     text('git_branch'),
  gitCommitSha:  text('git_commit_sha'),
  githubIssueId: text('github_issue_id'),
  createdAt:     text('created_at').notNull(),
  updatedAt:     text('updated_at').notNull(),
});
```

### Agent 模型（归属于用户，分配给自己的空间）

```typescript
export const agents = sqliteTable('agents', {
  id:          text('id').primaryKey(),
  createdBy:   text('created_by').notNull().references(() => users.id),  // 所有者
  workspaceId: text('workspace_id'),                     // 分配的空间（空=个人池，所有空间可用）
  type:        text('type').notNull(),                   // claude_code / codex / hermes / openclaw / custom
  name:        text('name').notNull(),
  execPath:    text('exec_path'),                        // CLI 可执行文件路径
  argsTemplate: text('args_template'),                   // 参数模板 '-p "{prompt}"'
  envVars:     text('env_vars'),                         // 环境变量 JSON
  enabled:     integer('enabled', { mode: 'boolean' }).default(true),
  config:      text('config'),                           // JSON 扩展配置
  createdAt:   text('created_at').notNull(),
});

// Agent 到特定项目绑定（可进一步限定到某 Project）
export const agentProjects = sqliteTable('agent_projects', {
  id:        text('id').primaryKey(),
  agentId:   text('agent_id').notNull().references(() => agents.id),
  projectId: text('project_id').notNull().references(() => projects.id),
});
```

### 成员模型

```typescript
export const workspaceMembers = sqliteTable('workspace_members', {
  id:          text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  userId:      text('user_id').notNull(),
  role:        text('role').notNull(),               // pm / architect / developer / qa / delivery_manager / admin
  joinedAt:    text('joined_at').notNull(),
});

export const projectMembers = sqliteTable('project_members', {
  id:        text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  userId:    text('user_id').notNull(),
  role:      text('role').notNull(),
  joinedAt:  text('joined_at').notNull(),
});
```

### Activity（操作日志）

```typescript
export const activities = sqliteTable('activities', {
  id:          text('id').primaryKey(),
  workspaceId: text('workspace_id'),
  projectId:   text('project_id'),
  actorId:     text('actor_id').notNull(),
  actorName:   text('actor_name'),
  action:      text('action').notNull(),             // "stage.approved" / "pr.opened" / ...
  target:      text('target'),
  metadata:    text('metadata'),                      // JSON
  createdAt:   text('created_at').notNull(),
});
```

## 文档存储方案（.md 文件）

### 设计原则

文档内容（PRD、技术方案、评审报告等）**不存数据库**，而是保存为 Markdown 文件。数据库只存元数据（标题、类型、文件路径、版本等）。

### 文件系统布局

```
data/
├── devrelay.db                               # SQLite 数据库文件
├── {workspace-slug}/                        # 空间目录
│   ├── projects/
│   │   └── {project-id}/                    # 项目目录
│   │       ├── docs/                        # 文档文件
│   │       │   ├── 01-prd-v1.md             # PRD 初版
│   │       │   ├── 01-prd-v2.md             # PRD 修改版
│   │       │   ├── 02-prototype-v1.md        # 原型描述
│   │       │   ├── 03-tech-design-v1.md      # 技术方案
│   │       │   ├── 04-code-review-report-v1.md
│   │       │   ├── 05-test-plan-v1.md
│   │       │   ├── 06-test-report-v1.md
│   │       │   └── 07-acceptance-report-v1.md
│   │       └── tasks/                       # 任务附件
│   │           └── {task-id}/
│   │               └── notes.md
│   └── config/                              # 空间配置
│       ├── settings.json
│       └── agents.json
```

### 文档版本管理

```typescript
// 版本策略：不覆盖旧文件，新建文件保留历史
// 命名规则：{step}-{type}-v{version}.md
// 例如：01-prd-v1.md → 01-prd-v2.md（驳回后修改重新生成）

interface DocFile {
  path: string;          // 相对路径
  version: number;
  createdAt: Date;
}

// 读最新版本
async function getLatestDoc(projectId: string, type: string): Promise<string> {
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.projectId, projectId), eq(documents.type, type)),
    orderBy: desc(documents.version),
  });
  if (!doc) return '';
  return fs.readFile(path.join(DATA_DIR, doc.filePath), 'utf-8');
}

// 写新版本
async function saveDocVersion(projectId: string, type: string, content: string, author: string) {
  const latest = await getLatestDocMeta(projectId, type);
  const newVersion = (latest?.version ?? 0) + 1;
  const fileName = `${String(s.step).padStart(2, '0')}-${type}-v${newVersion}.md`;
  const filePath = `projects/${projectId}/docs/${fileName}`;
  const fullPath = path.join(DATA_DIR, filePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');

  return db.insert(documents).values({
    id: cuid(),
    projectId,
    type,
    title: `${type} v${newVersion}`,
    filePath,
    version: newVersion,
    createdBy: author,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}
```

### 优势

| 项目 | 说明 |
|------|------|
| **体积小** | 纯文本，整个项目文档可能就几百 KB |
| **Git 友好** | `.md` 文件天然可 diff、可 code review |
| **可外部编辑** | 用户可以直接用 VS Code / Obsidian 打开编辑 |
| **AI 友好** | Agent 可以直接流式写入 .md 文件 |
| **备份简单** | 整个 `data/` 目录打包即备份 |

## GitHub 集成方案

### 双向联动

```
GitHub                          DevRelay
──────                          ────────
Issue ◄──────────────────────── Task（双向关联，可相互创建）
PR    ◄──────────────────────── Code Review Stage
Commit ──────────────────────── LinkedCommit（Webhook 自动同步）
Branch ──────────────────────── Task.gitBranch
Label / Milestone ◄─────────── Stage / Priority
```

### 集成功能清单

| 功能 | 说明 |
|------|------|
| **OAuth 认证** | GitHub OAuth App 授权，获取 `repo` + `webhook` scope，token 加密存储，支持 refresh |
| **Issue 同步** | DevRelay 创建 Task → 自动生成 GitHub Issue；GitHub Issue → Webhook → DevRelay Task |
| **PR 关联** | 开发提交 PR → Webhook 触发 → 自动关联到代码评审阶段（Stage 8） |
| **Commit 追踪** | Push 事件 → 解析 issue/PR 引用 → 自动关联 Commit 到 Task |
| **分支管理** | DevRelay 通过 Token + Octokit 创建/删除分支 |
| **Webhook** | 接收 GitHub 事件（push / issues / pull_request / pull_request_review）实时更新状态 |
| **Label 映射** | Stage 状态 → GitHub Label（如 `stage/review` `stage/done`） |

### Webhook 事件处理

```typescript
const GITHUB_EVENTS = {
  'issues.opened'       → 同步创建 DevRelay Task（如未关联）
  'issues.closed'       → 更新关联 Task 状态
  'pull_request.opened' → 自动关联到代码评审阶段
  'pull_request.closed' → 合并→推进阶段；关闭→回退
  'pull_request_review' → 审批通过/驳回同步到 DevRelay
  'push'                → 解析 commit message，关联到 Task/Stage
}
```

## Agent 归属与分配策略

### 归属：用户级别

```
用户 A 创建的 Agent       用户 B 创建的 Agent
      │                         │
      ├── 空间「电商」(A创建)    ├── 空间「SaaS」(B创建)
      ├── 空间「数据」(A创建)    └── 空间「工具」(B创建)
      └── 个人池（空 workspaceId）
```

- Agent 属于创建它的**用户**，只有创建者可以编辑/删除
- Agent 可分配给该用户创建的**任意空间**（`workspaceId`）
- `workspaceId` 为空 → 该用户的「个人池」，对该用户所有空间可见
- **其他用户不可见此 Agent**，即使在同一空间的成员也无法使用

### 分配粒度

| 分配方式 | 可见范围 | 适用场景 |
|---------|---------|---------|
| 个人池（workspaceId = null） | 该用户所有空间的所有项目 | 通用 Agent，如 Claude Code 到处用 |
| 分配到空间（workspaceId = X） | 该空间下所有项目 | 给某个产品线配置的专用 Agent |
| 分配到项目（agentProjects 表） | 仅该项目 | 客户定制场景，Agent 只用于特定交付 |

### Agent 选择优先级

```
Task 执行 → 先查 agentProjects（项目绑定）
         → 再查 agents（空间分配 + 个人池）
         → 仅返回 currentUser.createdBy 的 Agent
```

## API 设计概览

```
# 空间管理
POST   /api/workspaces                  # 创建空间
GET    /api/workspaces                  # 空间列表
GET    /api/workspaces/:slug            # 空间详情（含仓库、项目、Agent 概览）
PUT    /api/workspaces/:slug            # 更新空间

# 仓库管理
POST   /api/workspaces/:slug/repos     # 关联仓库
GET    /api/workspaces/:slug/repos     # 仓库列表
DELETE /api/workspaces/:slug/repos/:id # 解绑仓库
POST   /api/workspaces/:slug/repos/:id/sync  # 手动同步 Issues/PRs

# GitHub Webhook
POST   /api/webhooks/github/:repoId    # GitHub Webhook 接收端点

# 项目管理
POST   /api/workspaces/:slug/projects  # 创建项目
GET    /api/workspaces/:slug/projects  # 项目列表
GET    /api/projects/:id               # 项目详情
PUT    /api/projects/:id               # 更新项目
POST   /api/projects/:id/repos         # 关联仓库到项目

# 阶段管理
GET    /api/projects/:id/stages        # 阶段列表
PUT    /api/projects/:id/stages/:step  # 更新阶段
POST   /api/projects/:id/stages/:step/approve  # 通过
POST   /api/projects/:id/stages/:step/reject   # 驳回（附评审意见）

# 文档/任务管理
GET    /api/projects/:id/documents     # 文档列表
POST   /api/projects/:id/documents     # 创建文档
GET    /api/projects/:id/tasks         # 任务列表
POST   /api/projects/:id/tasks         # 创建任务

# Agent 管理
GET    /api/workspaces/:slug/agents    # 空间 Agent 池
POST   /api/workspaces/:slug/agents    # 注册 Agent（指定共享/独享）
PUT    /api/agents/:id                 # 更新 Agent 配置
DELETE /api/agents/:id                 # 移除 Agent
POST   /api/agents/:id/execute         # 执行 Agent 任务

# GitHub 操作
POST   /api/projects/:id/issues/sync   # 同步 Issues
POST   /api/projects/:id/prs/create    # 创建 PR
GET    /api/projects/:id/commits       # 关联 Commits 列表

# 活动日志
GET    /api/workspaces/:slug/activities  # 空间活动
GET    /api/projects/:id/activities      # 项目活动
```

## 前端页面结构

```
/                                          # 首页 - 空间列表
/workspaces/:slug                          # 空间首页 - 概览仪表盘
/workspaces/:slug/repos                    # 仓库管理
/workspaces/:slug/agents                   # Agent 池管理
/workspaces/:slug/settings                 # 空间设置

/workspaces/:slug/projects                 # 项目列表
/workspaces/:slug/projects/:id             # 流程看板（13 步可视化）
/workspaces/:slug/projects/:id/stages/:step # 阶段详情
/workspaces/:slug/projects/:id/documents   # 文档中心
/workspaces/:slug/projects/:id/documents/:docId  # 文档编辑器
/workspaces/:slug/projects/:id/tasks       # 任务看板 + GitHub Issue 联动
/workspaces/:slug/projects/:id/tasks/:taskId     # 任务详情（含关联 Commit/PR/Issue）
/workspaces/:slug/projects/:id/agents      # 项目 Agent 配置
/workspaces/:slug/projects/:id/settings    # 项目设置
/settings                                  # 全局设置
```

### 核心页面：流程看板

- 可视化展示 13 步流程的当前状态，Kanban 式左右滚动
- **颜色标识**：pending(灰)、in_progress(蓝)、completed(绿)、rejected(红)
- **阶段卡片**：显示关联文档数、任务数、关联 PR/Issue 数
- **点击阶段**：展开详情面板，可编辑文档、提交评审、查看 GitHub 联动状态
- **顶部进度条**：整体完成度

### 核心页面：任务看板 + GitHub 联动

- 左侧：DevRelay Task 列表（分列：TODO / In Progress / In Review / Done）
- 右侧：关联 GitHub Issue 面板（实时状态显示）
- 拖拽 Task → 自动更新 GitHub Issue 状态
- Task 详情页：Commit 时间线、关联 PR 列表、Agent 执行日志

## 开发计划（7 个 Phase）

### Phase 1：基础框架（Week 1-2）
- [ ] 初始化 Next.js 项目 + TypeScript + Tailwind + Custom Server (`server.ts`)
- [ ] Drizzle ORM + SQLite schema（users, workspaces, repositories, ... 全部表）
- [ ] data/ 目录结构 + .md 文件读写
- [ ] 用户认证：Credentials Provider + bcrypt + admin 初始账号（`ADMIN_USER`/`ADMIN_PASS`）
- [ ] 基础 UI 框架（布局、导航、登录页、空间列表页）
- [ ] `.env` 配置加载
- [ ] 开发环境一键启动（`npm run dev`）

### Phase 2：空间 + 仓库管理（Week 3-4）
- [ ] Workspace CRUD
- [ ] Repository 绑定/解绑
- [ ] GitHub OAuth App 注册 + 授权流程（scope: repo, workflow, webhook）
- [ ] GitHub Webhook 接收 + 解析
- [ ] Issue 列表/详情（从 GitHub 同步）

### Phase 3：项目管理 + 流程引擎（Week 5-6）
- [ ] Project CRUD
- [ ] Project ↔ Repository 关联
- [ ] 13 步阶段状态机
- [ ] 阶段流转（approve / reject 循环）
- [ ] 流程看板页面
- [ ] 活动日志

### Phase 4：文档 + 任务管理（Week 7-8）
- [ ] .md 文档 CRUD（Markdown 编辑器 + 文件读写）
- [ ] 文档版本管理（v1 → v2 → ...）
- [ ] 任务 CRUD + 看板视图
- [ ] Task ↔ GitHub Issue 双向关联
- [ ] Commit ↔ Task 自动关联（Webhook）

### Phase 5：Agent 集成（Week 9-11）
- [ ] Agent Plugin 架构
- [ ] 共享/独享 Agent 管理
- [ ] Claude Code 适配器
- [ ] Codex 适配器
- [ ] Hermes 适配器
- [ ] Agent 任务调度（内置 SQLite 队列）

### Phase 6：评审 + PR 联动（Week 12-13）
- [ ] 评审流程（提交→审批→驳回）
- [ ] PR ↔ 代码评审阶段自动联动
- [ ] 实时通知（WebSocket）
- [ ] 评论/讨论功能

### Phase 7：部署 + 交付闭环（Week 14-15）
- [ ] 部署状态追踪
- [ ] 客户验收流程
- [ ] 监控反馈闭环
- [ ] E2E 测试 + 生产部署
- [ ] 单容器 Docker 打包

## 目录结构

```
devrelay/
├── server.ts                         # Custom Server 入口（Next.js + Socket.io）
├── data/                             # 运行时数据目录（all in one 核心）
│   ├── devrelay.db                   # SQLite 数据库（单文件）
│   └── {workspace-slug}/             # 空间数据目录
│       ├── projects/{id}/docs/       # .md 文档文件
│       │   └── images/               # 原型图/附件图片
│       ├── projects/{id}/tasks/      # 任务附件
│       └── config/                   # 空间配置 (settings.json, agents.json)
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # 首页（空间列表 → 未登录重定向到登录页）
│   │   ├── login/                    # 登录页
│   │   ├── settings/                 # 全局/个人设置
│   │   └── workspaces/
│   │       └── [slug]/
│   │           ├── page.tsx          # 空间首页仪表盘
│   │           ├── repos/            # 仓库管理（GitHub OAuth 绑定）
│   │           ├── agents/           # Agent池管理
│   │           ├── settings/         # 空间设置（成员+邀请）
│   │           └── projects/
│   │               ├── page.tsx      # 项目列表
│   │               └── [id]/
│   │                   ├── page.tsx  # 流程看板
│   │                   ├── stages/   # 阶段详情
│   │                   ├── documents/# 文档中心（md编辑器）
│   │                   ├── tasks/    # 任务看板 + GitHub联动
│   │                   ├── agents/   # 项目Agent
│   │                   └── settings/ # 项目设置
│   ├── components/
│   │   ├── ui/                       # 通用UI组件
│   │   ├── auth/                     # 登录/注册组件
│   │   ├── workspace/                # 空间相关组件
│   │   ├── workflow/                 # 流程看板组件
│   │   ├── documents/                # Markdown编辑器组件
│   │   ├── tasks/                    # 任务组件
│   │   ├── github/                   # GitHub联动组件
│   │   ├── agents/                   # Agent配置组件
│   │   └── notifications/            # 通知中心组件
│   ├── lib/
│   │   ├── db/                       # Drizzle schema + client
│   │   ├── auth/                     # 认证逻辑（NextAuth Credentials + bcrypt）
│   │   ├── workflow/                 # 流程引擎（状态机）
│   │   ├── docs/                     # .md 文件读写服务
│   │   ├── github/                   # GitHub集成（Octokit + OAuth + Webhook）
│   │   ├── agents/                   # Agent适配器（spawn子进程） + 内置任务队列
│   │   ├── notify/                   # 通知服务（WebSocket 推送）
│   │   └── api/                      # tRPC routers
│   ├── server/
│   │   ├── routers/                  # tRPC路由
│   │   ├── webhooks/                 # Webhook处理
│   │   └── middleware/               # 服务端中间件
│   └── types/                        # 全局类型定义
├── public/
├── tests/
├── .env.example                      # 环境变量示例
├── drizzle.config.ts                 # Drizzle 配置
├── next.config.js
├── package.json
└── Dockerfile                        # 单容器（仅 Node.js + data/ 挂载）
```

## AI Agent 使用策略（本项目自身开发）

| 角色 | Agent | 职责 |
|------|-------|------|
| 架构师 | Claude Code | 技术方案设计、代码评审 |
| 开发 | Claude Code / Codex | 编码实现 |
| QA | Claude Code | E2E 测试编写 |

## 环境配置（.env）

```bash
# ===== 管理员初始账号 =====
ADMIN_USER=admin                     # 首次启动自动创建
ADMIN_PASS=devrelay2026              # 首次启动后请修改

# ===== 数据库与存储 =====
DATABASE_PATH=./data/devrelay.db     # SQLite 文件路径
DATA_DIR=./data                      # .md 文档 + 配置目录

# ===== NextAuth =====
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=change-me-to-random-string

# ===== GitHub OAuth App =====
GITHUB_CLIENT_ID=                    # GitHub OAuth App Client ID
GITHUB_CLIENT_SECRET=                # GitHub OAuth App Client Secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/callback/github

# ===== Agent 默认路径（可选，用户可在 UI 中覆盖）=====
CLAUDE_CODE_PATH=claude              # 或 /usr/local/bin/claude
CODEX_PATH=codex
HERMES_PATH=hermes
```

启动顺序：
1. 读取 `.env` → 2. 初始化 SQLite → 3. 检查 `ADMIN_USER` 是否存在 → 4. 不存在则用 `ADMIN_PASS` bcrypt 创建 → 5. 启动 custom server

## 待确认事项

1. ~~部署方式：私有化部署 or SaaS？~~ → **私有化部署**，`npx next start` 单进程运行
2. ~~是否需要 Company（组织）层级？~~ → 暂不需要，Workspace 足够
3. ~~Git 平台优先级？~~ → **仅 GitHub**，后续按需扩展
4. ~~是否需要移动端适配？~~ → 暂不需要，桌面 Web 优先
5. ~~通知渠道偏好？~~ → **仅站内通知**（WebSocket 实时推送 + 通知中心）
