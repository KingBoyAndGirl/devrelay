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
│               DevRelay (单一 Next.js 进程)                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    Web UI (React)                           │  │
│  │  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │  │
│  │  │ PM 视图  │ 架构师   │ 开发视图 │ QA 视图  │ 交付经理 │  │  │
│  │  └──────────┴──────────┴──────────┴──────────┴──────────┘  │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │                API + 流程引擎 (tRPC)                        │  │
│  │  ┌────────┬────────┬──────────┬──────────┬──────────────┐  │  │
│  │  │空间管理│项目管理│ 流程引擎 │GitHub集成│Agent调度     │  │  │
│  │  └────────┴────────┴──────────┴──────────┴──────────────┘  │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │  SQLite (单文件)  │  .md 文档目录  │  Agent 适配器        │  │
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

## 数据模型（Drizzle ORM + SQLite）

> 以下使用 Drizzle ORM 的 schema 定义风格。SQLite 原生类型：`integer`（整数/布尔）、`text`（字符串/JSON）、`blob`（二进制）。所有模型在 `src/lib/db/schema.ts` 中定义。

### Workspace（空间）

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

### Agent 模型（共享/独享）

```typescript
export const workspaceAgents = sqliteTable('workspace_agents', {
  id:          text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  type:        text('type').notNull(),               // claude_code / codex / hermes / openclaw / custom
  name:        text('name').notNull(),
  apiEndpoint: text('api_endpoint'),
  apiKey:      text('api_key'),                      // 加密存储
  enabled:     integer('enabled', { mode: 'boolean' }).default(true),
  scope:       text('scope').notNull().default('shared'), // shared / dedicated
  config:      text('config'),                       // JSON
  createdAt:   text('created_at').notNull(),
});

export const agentProjectAssignments = sqliteTable('agent_project_assignments', {
  id:        text('id').primaryKey(),
  agentId:   text('agent_id').notNull().references(() => workspaceAgents.id),
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
└── devrelay.db                               # SQLite 数据库文件
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
| **Issue 同步** | DevRelay 创建 Task → 自动生成 GitHub Issue；GitHub Issue → Webhook → DevRelay Task |
| **PR 关联** | 开发提交 PR → Webhook 触发 → 自动关联到代码评审阶段（Stage 8） |
| **Commit 追踪** | Push 事件 → 解析 issue/PR 引用 → 自动关联 Commit 到 Task |
| **分支管理** | DevRelay 通过 Octokit 创建/删除分支 |
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

## Agent 共享与独享策略

### 共享 Agent（Workspace 级别）
- 在 Workspace 下注册一次，**所有 Project** 均可调用
- 适合：通用 Agent（需求分析、代码审查、文档生成）
- 示例：Workspace「电商平台」注册一个 Claude Code，前后端 Project 共用

### 独享 Agent（Project 级别）
- 绑定到 **特定 Project**，其他 Project 不可见
- 适合：客户特定的 Agent 实例、独立配置、安全隔离
- 示例：Project「客户A 定制交付」绑定专用 Codex 实例

### Agent 选择优先级

```
Task 执行 → 先查 Project 独享 Agent → 无则使用 Workspace 共享 Agent → 无则提示配置
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
- [ ] 初始化 Next.js 项目 + TypeScript + Tailwind
- [ ] Drizzle ORM + SQLite schema（所有表）
- [ ] data/ 目录结构 + .md 文件读写
- [ ] NextAuth.js + SQLite 适配 + RBAC
- [ ] 基础 UI 框架（布局、导航、空间列表页）
- [ ] 开发环境一键启动（`npm run dev`）

### Phase 2：空间 + 仓库管理（Week 3-4）
- [ ] Workspace CRUD
- [ ] Repository 绑定/解绑
- [ ] GitHub OAuth 授权
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
├── data/                             # 运行时数据目录（all in one 核心）
│   ├── devrelay.db                   # SQLite 数据库（单文件）
│   └── {workspace-slug}/             # 空间数据目录
│       ├── projects/{id}/docs/       # .md 文档文件
│       ├── projects/{id}/tasks/      # 任务附件
│       └── config/                   # 空间配置 (settings.json, agents.json)
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # 首页（空间列表）
│   │   └── workspaces/
│   │       └── [slug]/
│   │           ├── page.tsx          # 空间首页仪表盘
│   │           ├── repos/            # 仓库管理
│   │           ├── agents/           # Agent池管理
│   │           ├── settings/         # 空间设置
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
│   │   ├── workspace/                # 空间相关组件
│   │   ├── workflow/                 # 流程看板组件
│   │   ├── documents/                # Markdown编辑器组件
│   │   ├── tasks/                    # 任务组件
│   │   ├── github/                   # GitHub联动组件
│   │   └── agents/                   # Agent配置组件
│   ├── lib/
│   │   ├── db/                       # Drizzle schema + client
│   │   ├── auth/                     # 认证逻辑
│   │   ├── workflow/                 # 流程引擎
│   │   ├── docs/                     # .md 文件读写服务
│   │   ├── github/                   # GitHub集成（Octokit + Webhook）
│   │   ├── agents/                   # Agent适配器 + 内置任务队列
│   │   └── api/                      # tRPC routers
│   ├── server/
│   │   ├── routers/                  # tRPC路由
│   │   ├── webhooks/                 # Webhook处理
│   │   └── middleware/               # 服务端中间件
│   └── types/                        # 类型定义
├── public/
├── tests/
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

## 待确认事项

1. 部署方式：私有化部署 or SaaS？
2. 是否需要 Company（组织）层级，支持多个独立公司/团队？
3. Git 平台优先级：先 GitHub → 后续 GitLab / Gitee？
4. 是否需要移动端适配？
5. 通知渠道偏好（站内 / 邮件 / 企微 / 钉钉 / Slack）？
