# 开发规范

## 一、Git 分支规范

### 分支命名

| 类型 | 前缀 | 示例 |
|------|------|------|
| 功能 | `feat/` | `feat/floating-agent-chat` |
| 修复 | `fix/` | `fix/hermes-thinking` |
| 重构 | `refactor/` | `refactor/agent-backend` |
| 文档 | `docs/` | `docs/readme` |

### 分支流程

```
main (稳定分支)
  ↑
  ├── feat/xxx  (功能分支，PR 合并)
  ├── fix/xxx   (修复分支，PR 合并)
  └── ...
```

1. 从 `main` 创建功能/修复分支
2. 开发完成后提交 PR
3. 审核通过后合并到 `main`
4. **所有功能修改必须通过 PR 合并，不直接 push 到 main**

### Commit 规范

```
<type>: <简短描述>

<详细说明（可选）>
```

类型：`feat` / `fix` / `perf` / `refactor` / `docs` / `style` / `test` / `chore`

示例：
```
feat: 全局浮动 Agent 对话按钮 + 测试空间
fix: 修复 Hermes 思考内容重复显示问题
perf: 拖拽缩放改为直接操作 DOM，消除卡顿
```

## 二、缓存问题及解决方案

### 问题现象

开发过程中修改代码后重启服务，浏览器出现：

```
Server Error
Error: Cannot find module './vendor-chunks/drizzle-orm.js'
```

或页面返回 500 错误。

### 根本原因

Next.js 14 使用 Webpack 的持久化缓存机制，将 `node_modules` 中的依赖打包为 `vendor-chunks/` 缓存到 `.next/` 目录。以下操作会导致缓存失效但未正确清除：

| 触发场景 | 原因 |
|----------|------|
| 切换 Git 分支 | 不同分支的依赖版本或导入路径不同，缓存指向已变更的 chunk |
| 修改 `schema.ts` | Drizzle ORM 的类型推导会改变 Webpack chunk 拆分策略 |
| 新增/删除模块导入 | 改变了模块依赖图，旧 chunk hash 失效 |
| `npm install` | 更新依赖后旧 vendor chunk 仍被引用 |

**核心原因**：Next.js 的 Webpack 缓存不会自动清理过期的 vendor chunk 文件。当 chunk hash 变化后，旧文件仍在 `.next/server/vendor-chunks/` 中，但运行时找不到对应的新 chunk。

### 解决方案

**方法 1：清理缓存重启（推荐）**

```bash
npm run clean
```

这个命令会删除 `.next` 目录并重启开发服务器。

**方法 2：手动清理**

```bash
rm -rf .next
npm run dev
```

**方法 3：开发时避免触发**

- 尽量在同一分支内开发，减少分支切换
- 修改 `schema.ts` 后主动清理缓存
- 新增文件后如果报错，先尝试清理缓存

## 三、开发经验总结

### 1. Go Sidecar 进程管理

Sidecar 进程（端口 4100）不会自动退出。修改 Go 代码后需要手动重启：

```bash
# 杀掉旧进程
pkill -f "devrelay.*start"
# 或
ss -tlnp | grep 4100  # 找到 PID
kill -9 <PID>

# 重新启动
npm run dev
```

修改 Go 代码后必须重新编译：

```bash
cd packages/devrelay-agent
/home/dev/go/bin/go build -o devrelay .
```

编译产物名必须是 `devrelay`（与 `server.ts` 中 `sidecarPath` 一致）。

### 2. TypeScript 类型一致性

项目存在两套事件类型体系：

| 来源 | 事件类型 |
|------|----------|
| 旧格式（Sidecar 响应） | `stdout`, `stderr`, `exit`, `timeout` |
| 新格式（AgentBackend） | `text`, `thinking`, `tool_use`, `tool_result`, `status`, `error`, `exit` |

修改 Agent 相关代码时需要注意统一使用新格式。`timeout` 不再是独立事件类型，而是 `exit` 事件的 `finalStatus: 'timeout'`。

### 3. React 拖拽性能

拖拽交互中 `setState()` 会触发整个组件树重渲染，导致卡顿。正确做法：

```typescript
// ❌ 每次 mousemove 都 setState
const onMove = (e) => {
  setSize({ w: e.clientX, h: e.clientY }) // 触发重渲染
}

// ✅ 拖拽期间直接操作 DOM，松手后同步状态
const onMove = (e) => {
  container.style.width = newW + 'px' // 无重渲染
}
const onUp = () => {
  setSize({ w: lastW, h: lastH }) // 仅同步一次
}
```

同时需要将拖拽状态（`resizing`、起始坐标等）存入 `useRef` 而非闭包变量，避免 `useEffect` 因依赖变化重建时丢失状态。

### 4. 客户端/服务端模块隔离

Next.js 的 App Router 中，被页面组件导入的模块会同时在客户端和服务端加载。`child_process`、`fs` 等 Node.js 模块不能出现在客户端 bundle 中。

解决方案：将包含 Node.js 模块的函数从公共 `index.ts` 中移除，仅在 API Route 中直接导入。

```typescript
// ❌ index.ts 中导出了 spawn 相关函数
export { runAgentStream, buildSpawnConfig } from './spawn'

// ✅ index.ts 仅导出类型和安全的客户端函数
export type { AgentEvent } from './backends/types'
export { AGENT_TYPE_META } from './backends/registry'
```

### 5. ACP 协议（Hermes）特殊行为

Hermes 使用 ACP 协议，与 Claude Code / Codex 的行为差异：

- `turn_end` 事件不一定发送（v1 协议中完成信号是 RPC 响应）
- 思考内容以 `agent_thought_chunk` 小片段发送，需要累积后一次性 flush
- 多轮对话使用 `session/resume` 恢复，需防止历史事件误触发完成

修改 Hermes 后端时务必测试多轮对话场景。
