import { spawn, ChildProcess } from 'child_process';
import { AGENT_TYPES, AgentSpawnConfig, AgentType, AgentStreamEvent } from './index';

const RATE_LIMIT_PATTERNS = [/rate.?limit/i, /too many requests/i, /429/i];
const AUTH_ERROR_PATTERNS = [/unauthorized/i, /authentication/i, /invalid.*(key|token)/i, /401/i];

export function classifyStderr(stderr: string): 'rate_limit' | 'auth' | null {
  if (RATE_LIMIT_PATTERNS.some((p) => p.test(stderr))) return 'rate_limit';
  if (AUTH_ERROR_PATTERNS.some((p) => p.test(stderr))) return 'auth';
  return null;
}

export function buildSpawnConfig(agent: {
  type: string;
  execPath: string | null;
  argsTemplate: string | null;
  envVars: string | null;
  config?: string | null;
}): AgentSpawnConfig {
  const typeInfo = AGENT_TYPES[agent.type as AgentType] || AGENT_TYPES.custom;

  const envVars: Record<string, string> = {};
  if (agent.envVars) {
    try {
      Object.assign(envVars, JSON.parse(agent.envVars));
    } catch { /* ignore parse errors */ }
  }

  // Merge agent.config (base_url, env_key) into env vars
  if (agent.config) {
    try {
      const cfg = JSON.parse(agent.config);
      if (cfg.base_url) envVars['PROVIDER_BASE_URL'] = cfg.base_url;
      if (cfg.env_key) envVars['PROVIDER_ENV_KEY'] = cfg.env_key;
    } catch { /* ignore parse errors */ }
  }

  return {
    execPath: agent.execPath || typeInfo.defaultPath,
    argsTemplate: agent.argsTemplate || typeInfo.defaultArgs,
    envVars,
    timeoutMs: typeInfo.defaultTimeoutMs,
  };
}

function parseArgs(config: AgentSpawnConfig, prompt: string): string[] {
  return config.argsTemplate
    .replace('{prompt}', prompt)
    .split(/\s+/)
    .filter(Boolean);
}

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10 MB cap per run

// ── Streaming spawn ──────────────────────────────────────────────

export async function* runAgentStream(
  config: AgentSpawnConfig,
  prompt: string,
  opts?: { heartbeatMs?: number; signal?: AbortSignal }
): AsyncGenerator<AgentStreamEvent> {
  const args = parseArgs(config, prompt);
  const heartbeatMs = opts?.heartbeatMs ?? 120_000;

  const child = spawn(config.execPath, args, {
    env: { ...process.env, ...config.envVars },
    cwd: config.cwd || process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin!.end();  // close stdin so CLI doesn't block waiting for input

  let totalOutput = 0;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  const resetHeartbeat = () => {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
      }
    }, heartbeatMs);
  };

  const onAbort = () => {
    if (!settled) {
      settled = true;
      child.kill('SIGKILL');
    }
  };
  opts?.signal?.addEventListener('abort', onAbort, { once: true });

  resetHeartbeat();

  const readStream = (
    stream: NodeJS.ReadableStream,
    type: 'stdout' | 'stderr'
  ) => {
    stream.on('data', (chunk: Buffer) => {
      totalOutput += chunk.length;
      if (totalOutput > MAX_OUTPUT_BYTES && !settled) {
        settled = true;
        child.kill('SIGKILL');
        return;
      }
      resetHeartbeat();
    });
  };
  readStream(child.stdout!, 'stdout');
  readStream(child.stderr!, 'stderr');

  try {
    for await (const chunk of child.stdout!) {
      if (settled) break;
      yield { type: 'stdout', data: chunk.toString() };
    }
    for await (const chunk of child.stderr!) {
      if (settled) break;
      yield { type: 'stderr', data: chunk.toString() };
    }
  } catch {
    // stream error, process likely killed
  }

  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  opts?.signal?.removeEventListener('abort', onAbort);

  if (totalOutput > MAX_OUTPUT_BYTES) {
    yield {
      type: 'error',
      error: `Output exceeded ${MAX_OUTPUT_BYTES / 1024 / 1024}MB limit`,
      exitCode: null,
    };
    return;
  }

  if (settled && child.exitCode === null) {
    yield { type: 'timeout', exitCode: null };
    return;
  }

  yield { type: 'exit', exitCode: child.exitCode };
}

// ── Fire-and-forget spawn (backward-compatible) ──────────────────

export function runAgent(
  config: AgentSpawnConfig,
  prompt: string
): ChildProcess {
  const args = parseArgs(config, prompt);
  return spawn(config.execPath, args, {
    env: { ...process.env, ...config.envVars },
    cwd: config.cwd || process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
  }).on('spawn', function(this: ChildProcess) { this.stdin!.end(); });
}

// ── Concurrency limiter ──────────────────────────────────────────

export class AgentConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number = 3) {}

  acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }

  get active(): number {
    return this.running;
  }

  get pending(): number {
    return this.queue.length;
  }
}

export const defaultLimiter = new AgentConcurrencyLimiter(3);
