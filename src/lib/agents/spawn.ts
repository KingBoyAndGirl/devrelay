import { spawn, ChildProcess } from 'child_process'
import { getBackend, AGENT_TYPE_META, type AgentType } from './backends/registry'
import type { AgentBackendConfig, AgentEvent, ParserState } from './backends/types'

export interface AgentSpawnConfig {
  agentType: string
  execPath: string
  prompt: string
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  sessionId?: string
}

const RATE_LIMIT_PATTERNS = [/rate.?limit/i, /too many requests/i, /429/i]
const AUTH_ERROR_PATTERNS = [/unauthorized/i, /authentication/i, /invalid.*(key|token)/i, /401/i]

// Stderr diagnostic lines that should not be surfaced as agent output
const STDERR_DIAGNOSTIC = [
  /Reading additional input from stdin/i,
  /^OpenAI Codex v/i,
  /^workdir:/i,
  /^model:/i,
  /^provider:/i,
  /^approval:/i,
  /^sandbox:/i,
  /^reasoning effort:/i,
  /^reasoning summaries:/i,
  /^session id:/i,
  /^-{3,}/,
  /^warning:/i,
  /^tokens used/i,
  /^\d{1,3}(,\d{3})*$/,
  /^Claude Code v/i,
  /^Hermes v/i,
  /^user$/,
  /^assistant$/,
  /^codex$/i,
  /^owl$/i,
  /^\d+$/,  // bare numbers (token counts)
]

function isStderrDiagnostic(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  return STDERR_DIAGNOSTIC.some(p => p.test(trimmed))
}

export function classifyStderr(stderr: string): 'rate_limit' | 'auth' | null {
  if (RATE_LIMIT_PATTERNS.some((p) => p.test(stderr))) return 'rate_limit'
  if (AUTH_ERROR_PATTERNS.some((p) => p.test(stderr))) return 'auth'
  return null
}

export function buildSpawnConfig(agent: {
  type: string
  execPath: string | null
  argsTemplate: string | null
  envVars: string | null
  config?: string | null
}): { execPath: string; args: string[]; env: Record<string, string>; timeoutMs: number } {
  const meta = AGENT_TYPE_META[agent.type as AgentType]
  const envVars: Record<string, string> = {}
  if (agent.envVars) {
    try { Object.assign(envVars, JSON.parse(agent.envVars)) } catch {}
  }
  if (agent.config) {
    try {
      const cfg = JSON.parse(agent.config)
      if (cfg.base_url) envVars['PROVIDER_BASE_URL'] = cfg.base_url
      if (cfg.env_key) envVars['PROVIDER_ENV_KEY'] = cfg.env_key
    } catch {}
  }
  return {
    execPath: agent.execPath || meta?.defaultPath || '',
    args: [],
    env: envVars,
    timeoutMs: meta?.defaultTimeoutMs ?? 600_000,
  }
}

// ── Streaming spawn via unified backend ──────────────────────────

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024

export async function* runAgentStream(
  agentType: string,
  execPath: string,
  prompt: string,
  opts?: {
    cwd?: string
    env?: Record<string, string>
    timeoutMs?: number
    sessionId?: string
    signal?: AbortSignal
  }
): AsyncGenerator<AgentEvent> {
  const backend = getBackend(agentType)
  const config: AgentBackendConfig = {
    cwd: opts?.cwd,
    env: opts?.env,
    timeoutMs: opts?.timeoutMs,
    sessionId: opts?.sessionId,
  }
  const args = backend.buildArgs(prompt, config)

  const child = spawn(execPath, args, {
    env: { ...process.env, ...config.env },
    cwd: config.cwd || process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stdin!.end()

  let totalOutput = 0
  let settled = false

  const state: ParserState = {
    output: '',
    pendingTools: new Map(),
    turnStarted: true,
  }

  const onAbort = () => {
    if (!settled) { settled = true; child.kill('SIGKILL') }
  }
  opts?.signal?.addEventListener('abort', onAbort, { once: true })

  // Buffer stderr non-diagnostic lines as potential thinking content.
  // Only emit if stdout produces nothing (fallback for agents that
  // write everything to stderr).
  let stderrBuf = ''
  const stderrThinking: string[] = []

  // Read both streams concurrently, buffer stderr
  const stdoutDone = readStreamLines(child.stdout!, (line) => {
    if (settled) return
    totalOutput += line.length
    if (totalOutput > MAX_OUTPUT_BYTES) {
      child.kill('SIGKILL')
      return
    }
    const event = backend.parseLine(line, state)
    if (event) pendingEvents.push(event)
  })

  const stderrDone = readStreamLines(child.stderr!, (line) => {
    stderrBuf += line + '\n'
    if (!isStderrDiagnostic(line)) {
      stderrThinking.push(line)
    }
  })

  // Yield stdout events as they arrive
  while (!stdoutDone.done || pendingEvents.length > 0) {
    while (pendingEvents.length > 0) {
      yield pendingEvents.shift()!
    }
    if (!stdoutDone.done) await new Promise(r => setTimeout(r, 10))
    if (stdoutDone.done && pendingEvents.length === 0) break
  }

  // Wait for stderr to finish
  while (!stderrDone.done) {
    await new Promise(r => setTimeout(r, 10))
  }

  // If stdout produced text output, we're done — ignore stderr content.
  // If stdout was empty, use stderr as fallback (emit as thinking).
  if (state.output.trim().length === 0 && stderrThinking.length > 0) {
    for (const line of stderrThinking) {
      yield { type: 'thinking', content: line }
    }
  }

  opts?.signal?.removeEventListener('abort', onAbort)

  // Final exit event
  if (totalOutput > MAX_OUTPUT_BYTES) {
    yield { type: 'error', content: `Output exceeded ${MAX_OUTPUT_BYTES / 1024 / 1024}MB limit` }
    return
  }

  if (settled && child.exitCode === null) {
    yield { type: 'exit', finalStatus: 'timeout' }
    return
  }

  // Let backend produce the final exit event
  const endEvent = backend.onEnd(state)
  if (endEvent) {
    // Augment with stderr classification if completed but stderr has errors
    if (endEvent.finalStatus === 'completed' && stderrBuf) {
      const classification = classifyStderr(stderrBuf)
      if (classification) {
        endEvent.finalStatus = 'failed'
        endEvent.content = stderrBuf.trim().split('\n').slice(-3).join('\n')
      }
    }
    yield endEvent
  }
}

// Helper: read a stream line-by-line, calling callback for each line
function readStreamLines(
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void
): { done: boolean } {
  const state = { done: false }
  let buf = ''

  stream.on('data', (chunk: Buffer) => {
    buf += chunk.toString()
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      onLine(line)
    }
  })

  stream.on('end', () => {
    if (buf.trim()) onLine(buf)
    state.done = true
  })

  stream.on('error', () => {
    state.done = true
  })

  return state
}

// ── Fire-and-forget spawn ────────────────────────────────────────

export function runAgent(
  agentType: string,
  execPath: string,
  prompt: string,
  opts?: { cwd?: string; env?: Record<string, string> }
): ChildProcess {
  const backend = getBackend(agentType)
  const args = backend.buildArgs(prompt, { cwd: opts?.cwd, env: opts?.env })
  return spawn(execPath, args, {
    env: { ...process.env, ...opts?.env },
    cwd: opts?.cwd || process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
  }).on('spawn', function(this: ChildProcess) { this.stdin!.end() })
}

// ── Concurrency limiter ──────────────────────────────────────────

export class AgentConcurrencyLimiter {
  private running = 0
  private queue: Array<() => void> = []
  constructor(private maxConcurrent: number = 3) {}

  acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) { this.running++; return Promise.resolve() }
    return new Promise((resolve) => { this.queue.push(resolve) })
  }
  release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) { this.running++; next() }
  }
  get active(): number { return this.running }
  get pending(): number { return this.queue.length }
}

export const defaultLimiter = new AgentConcurrencyLimiter(3)
