# DevRelay - AI 驱动的软件交付生命周期管理平台

## 项目概述

DevRelay 是一个面向软件交付团队的 Web 平台，将完整的软件开发交付流程（需求→设计→开发→测试→部署→交付）数字化、自动化。

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
| 前端 | Next.js 14 (App Router) + TypeScript + Tailwind CSS | 服务端渲染，类型安全 |
| 后端 API | Next.js API Routes + tRPC | 端到端类型安全 |
| 数据库 | PostgreSQL + Prisma ORM | 关系型数据，结构化查询 |
| 实时通信 | WebSocket (Socket.io) | 流程状态实时推送 |
| 认证 | NextAuth.js + RBAC | 角色权限控制 |
| GitHub 对接 | Octokit (REST + GraphQL) + Webhook | Issue/PR/Commit 管理 |
| AI Agent 集成 | Plugin 架构 + REST 适配器 | 统一接入各智能体 |
| 任务队列 | BullMQ + Redis | 异步任务、Agent 调度 |
| 文件存储 | MinIO / S3 | PRD、原型图、技术文档存储 |
| 容器化 | Docker + Docker Compose | 开发/部署一致性 |

## 系统架构

```
┌──────────────────────────────────────────────────────────────────┐
│                       Web UI (Next.js)                            │
│  ┌──────────┬──────────┬──────────┬──────────┬───────────────┐   │
│  │ PM 视图  │ 架构师   │ 开发视图 │ QA 视图  │ 交付经理视图  │   │
│  │          │ 视图     │          │          │               │   │
│  └──────────┴──────────┴──────────┴──────────┴───────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│                      API Layer (tRPC)                             │
│  ┌────────┬────────┬──────────┬──────────┬────────┬──────────┐   │
│  │空间管理│项目管理│ 流程引擎 │ 文档管理 │任务管理│GitHub集成│   │
│  └────────┴────────┴──────────┴──────────┴────────┴──────────┘   │
├──────────────────────────────────────────────────────────────────┤
│                     Agent Integration Layer                       │
│  ┌──────────────┬──────────┬──────────┬──────────┬──────────┐    │
│  │  Agent Pool  │ Claude   │  Codex   │  Hermes  │OpenClaw..│    │
│  │ (共享/独享)  │  Code    │          │          │          │    │
│  └──────────────┴──────────┴──────────┴──────────┴──────────┘    │
├──────────────────────────────────────────────────────────────────┤
│                Data Layer (PostgreSQL + Redis)                    │
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

## 数据模型

### Workspace（空间）

```prisma
model Workspace {
  id           String        @id @default(cuid())
  name         String
  slug         String        @unique            // URL 友好标识
  description  String?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  repositories Repository[]
  projects     Project[]
  agents       WorkspaceAgent[]
  members      WorkspaceMember[]
  activities   Activity[]
}
```

### Repository（仓库，关联 GitHub）

```prisma
model Repository {
  id            String       @id @default(cuid())
  workspaceId   String
  workspace     Workspace    @relation(fields: [workspaceId], references: [id])
  name          String                          // 如 "frontend"、"backend"
  provider      GitProvider  @default(GITHUB)
  remoteUrl     String                          // https://github.com/org/repo.git
  defaultBranch String       @default("main")
  webhookSecret String?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  issues        GitHubIssue[]
  pullRequests  PullRequest[]
  commits       LinkedCommit[]

  @@unique([workspaceId, name])
}

enum GitProvider {
  GITHUB
  GITLAB
  GITEE
}
```

### GitHub Issue（与仓库同步）

```prisma
model GitHubIssue {
  id             String     @id @default(cuid())
  repositoryId   String
  repository     Repository @relation(fields: [repositoryId], references: [id])
  issueNumber    Int                            // GitHub Issue Number
  title          String
  body           String?
  state          String     @default("open")    // open / closed
  labels         String[]                       // GitHub Labels
  assignees      String[]                       // GitHub 用户名
  devrelayTaskId String?                        // 关联 DevRelay Task
  syncedAt       DateTime   @default(now())
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  @@unique([repositoryId, issueNumber])
}
```

### Pull Request

```prisma
model PullRequest {
  id             String     @id @default(cuid())
  repositoryId   String
  repository     Repository @relation(fields: [repositoryId], references: [id])
  prNumber       Int                           // GitHub PR Number
  title          String
  body           String?
  state          String     @default("open")   // open / closed / merged
  sourceBranch   String
  targetBranch   String
  commitSha      String?
  devrelayTaskId  String?                      // 关联 DevRelay Task
  devrelayStageId String?                      // 关联代码评审阶段
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  @@unique([repositoryId, prNumber])
}
```

### LinkedCommit（关联 Commit）

```prisma
model LinkedCommit {
  id           String     @id @default(cuid())
  repositoryId String
  repository   Repository @relation(fields: [repositoryId], references: [id])
  sha          String
  message      String
  author       String?
  branch       String
  taskId       String?                        // 关联 DevRelay Task
  projectId    String?                        // 关联 Project
  createdAt    DateTime   @default(now())
}
```

### Project（交付项目）

```prisma
model Project {
  id           String        @id @default(cuid())
  workspaceId  String
  workspace    Workspace     @relation(fields: [workspaceId], references: [id])
  name         String
  description  String?
  customer     String?                          // 客户名称
  status       ProjectStatus @default(ACTIVE)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  stages       Stage[]
  documents    Document[]
  tasks        Task[]
  repoLinks    ProjectRepo[]
  members      ProjectMember[]
  activities   Activity[]
}

enum ProjectStatus {
  ACTIVE
  COMPLETED
  ARCHIVED
}
```

### ProjectRepo（项目-仓库关联）

```prisma
model ProjectRepo {
  id           String     @id @default(cuid())
  projectId    String
  project      Project    @relation(fields: [projectId], references: [id])
  repositoryId String
  repository   Repository @relation(fields: [repositoryId], references: [id])

  @@unique([projectId, repositoryId])
}
```

### Stage / Document / Task

```prisma
model Stage {
  id          String      @id @default(cuid())
  projectId   String
  project     Project     @relation(fields: [projectId], references: [id])
  step        Int
  name        String
  status      StageStatus @default(PENDING)
  assignedTo  String?                        // 负责角色
  reviewNotes String?
  startedAt   DateTime?
  completedAt DateTime?

  @@unique([projectId, step])
}

model Document {
  id          String       @id @default(cuid())
  projectId   String
  project     Project      @relation(fields: [projectId], references: [id])
  type        DocumentType
  title       String
  content     String                          // Markdown
  version     Int          @default(1)
  createdBy   String
  stageId     String?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

model Task {
  id            String     @id @default(cuid())
  projectId     String
  project       Project    @relation(fields: [projectId], references: [id])
  title         String
  description   String?
  status        TaskStatus @default(TODO)
  priority      Priority   @default(MEDIUM)
  assignedTo    String?
  stageId       String?
  agentId       String?                       // 使用的 Agent
  repositoryId  String?                       // 关联的仓库
  gitBranch     String?
  gitCommitSha  String?
  githubIssueId String?                       // 关联的 GitHub Issue ID
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt
}
```

### Agent 模型（共享/独享）

```prisma
model WorkspaceAgent {
  id          String      @id @default(cuid())
  workspaceId String
  workspace   Workspace   @relation(fields: [workspaceId], references: [id])
  type        AgentType
  name        String
  apiEndpoint String
  apiKey      String                          // 加密存储
  enabled     Boolean     @default(true)
  scope       AgentScope  @default(SHARED)    // 共享 or 独享
  config      Json?                           // Agent特定配置
  createdAt   DateTime    @default(now())

  projectAssignments AgentProjectAssignment[]
}

enum AgentType {
  CLAUDE_CODE
  CODEX
  HERMES
  OPENCLAW
  CUSTOM
}

enum AgentScope {
  SHARED                                      // 空间内所有项目可用
  DEDICATED                                   // 仅指定项目可用
}

model AgentProjectAssignment {
  id        String         @id @default(cuid())
  agentId   String
  agent     WorkspaceAgent @relation(fields: [agentId], references: [id])
  projectId String
  project   Project        @relation(fields: [projectId], references: [id])

  @@unique([agentId, projectId])
}
```

### 成员模型

```prisma
model WorkspaceMember {
  id          String   @id @default(cuid())
  workspaceId String
  userId      String
  role        Role
  joinedAt    DateTime @default(now())

  @@unique([workspaceId, userId])
}

model ProjectMember {
  id        String   @id @default(cuid())
  projectId String
  userId    String
  role      Role
  joinedAt  DateTime @default(now())

  @@unique([projectId, userId])
}

enum Role {
  PM
  ARCHITECT
  DEVELOPER
  QA
  DELIVERY_MANAGER
  ADMIN
}
```

### Activity（操作日志）

```prisma
model Activity {
  id          String   @id @default(cuid())
  workspaceId String?
  projectId   String?
  actorId     String
  actorName   String
  action      String                           // "stage.approved" / "pr.opened" / "issue.linked"
  target      String?
  metadata    Json?
  createdAt   DateTime @default(now())
}
```

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
- [ ] 搭建 Prisma schema + PostgreSQL
- [ ] NextAuth.js 认证 + RBAC
- [ ] 基础 UI 框架（布局、导航）
- [ ] Docker Compose 开发环境

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
- [ ] 文档 CRUD（Markdown 编辑器）
- [ ] 任务 CRUD + 看板视图
- [ ] Task ↔ GitHub Issue 双向关联
- [ ] Commit ↔ Task 自动关联（Webhook）

### Phase 5：Agent 集成（Week 9-11）
- [ ] Agent Plugin 架构
- [ ] 共享/独享 Agent 管理
- [ ] Claude Code 适配器
- [ ] Codex 适配器
- [ ] Hermes 适配器
- [ ] Agent 任务调度（BullMQ）

### Phase 6：评审 + PR 联动（Week 12-13）
- [ ] 评审流程（提交→审批→驳回）
- [ ] PR ↔ 代码评审阶段自动联动
- [ ] 实时通知（WebSocket）
- [ ] 评论/讨论功能

### Phase 7：部署 + 交付闭环（Week 14-15）
- [ ] 部署状态追踪
- [ ] 客户验收流程
- [ ] 监控反馈闭环
- [ ] E2E 测试 + 部署上线

## 目录结构

```
devrelay/
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
│   │                   ├── documents/# 文档中心
│   │                   ├── tasks/    # 任务看板 + GitHub联动
│   │                   ├── agents/   # 项目Agent
│   │                   └── settings/ # 项目设置
│   ├── components/
│   │   ├── ui/                       # 通用UI组件
│   │   ├── workspace/                # 空间相关组件
│   │   ├── workflow/                 # 流程看板组件
│   │   ├── documents/                # 文档编辑器组件
│   │   ├── tasks/                    # 任务组件
│   │   ├── github/                   # GitHub联动组件
│   │   └── agents/                   # Agent配置组件
│   ├── lib/
│   │   ├── db/                       # Prisma client
│   │   ├── auth/                     # 认证逻辑
│   │   ├── workflow/                 # 流程引擎
│   │   ├── github/                   # GitHub集成（Octokit + Webhook）
│   │   ├── agents/                   # Agent适配器
│   │   └── api/                      # tRPC routers
│   ├── server/
│   │   ├── routers/                  # tRPC路由
│   │   ├── webhooks/                 # Webhook处理
│   │   └── middleware/               # 服务端中间件
│   └── types/                        # 类型定义
├── prisma/
│   └── schema.prisma
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── public/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/
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
