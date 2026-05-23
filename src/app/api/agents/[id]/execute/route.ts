import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { agents, activities, projectRepos } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { config } from '@/lib/config';
import { buildSpawnConfig, runAgentStream, classifyStderr, defaultLimiter } from '@/lib/agents/spawn';
import { ensureWorktree, getRepoWorkdir } from '@/lib/git/worktree';
import { runAutoPR } from '@/lib/git/auto-pr';
import { createId } from '@paralleldrive/cuid2';

const SIDECAR_URL = config.agents.sidecarUrl;
const SIDECAR_TOKEN = config.agents.agentToken;

function sidecarHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (SIDECAR_TOKEN) headers['Authorization'] = `Bearer ${SIDECAR_TOKEN}`;
  return headers;
}

async function sidecarAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${SIDECAR_URL}/health`, {
      signal: AbortSignal.timeout(2000),
      headers: SIDECAR_TOKEN ? { Authorization: `Bearer ${SIDECAR_TOKEN}` } : {},
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, params.id),
  });

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (!agent.enabled) {
    return NextResponse.json({ error: 'Agent is disabled' }, { status: 400 });
  }

  const body = await req.json();
  const { prompt } = body;
  const stream = body.stream !== false;
  const projectId = body.projectId as string | undefined;
  const taskId = body.taskId as string | undefined;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  // Try sidecar first for better process management
  if (await sidecarAvailable()) {
    return proxyToSidecar(agent, prompt, stream, projectId, taskId);
  }

  // Fallback to direct spawn
  const spawnConfig = buildSpawnConfig(agent);

  // Safety: set cwd to project repo if projectId is provided
  if (projectId) {
    try {
      const pr = await db.query.projectRepos.findFirst({
        where: eq(projectRepos.projectId, projectId),
        with: { repository: true },
      });
      if (pr?.repository) {
        const { workdir } = await ensureWorktree(projectId, pr.repository.id);
        spawnConfig.cwd = workdir;
      }
    } catch { /* worktree not available, run in default cwd */ }
  }

  // Log execution start
  if (projectId && taskId) {
    try {
      await db.insert(activities).values({
        id: createId(),
        projectId,
        actorId: agent.id,
        actorName: agent.name,
        action: 'agent_execution_started',
        target: taskId,
        createdAt: new Date().toISOString(),
      });
    } catch { /* activity logging is best-effort */ }
  }

  if (defaultLimiter.active >= 3) {
    return NextResponse.json(
      { error: 'Too many agents running', queuePosition: defaultLimiter.pending + 1 },
      { status: 429 }
    );
  }

  if (!stream) {
    return runSync(spawnConfig, prompt, agent, projectId, taskId);
  }

  return runStreaming(spawnConfig, prompt, agent, projectId, taskId, params.id);
}

// ── Sidecar proxy ────────────────────────────────────────────────

async function proxyToSidecar(
  agent: { type: string; execPath: string | null; argsTemplate: string | null; envVars: string | null; name: string; gitName: string | null; gitEmail: string | null },
  prompt: string,
  stream: boolean,
  projectId?: string,
  taskId?: string
): Promise<NextResponse> {
  // If auto-PR is needed, fall back to direct spawn which handles post-execution
  if (projectId && taskId) {
    return runStreaming(buildSpawnConfig(agent), prompt, agent, projectId, taskId);
  }

  const cli = agent.execPath || mapTypeToCLI(agent.type);

  const res = await fetch(`${SIDECAR_URL}/execute`, {
    method: 'POST',
    headers: sidecarHeaders(),
    body: JSON.stringify({ cli, prompt }),
  });

  if (res.status === 429) {
    const data = await res.json();
    return NextResponse.json(data, { status: 429 });
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: (data as any).error || `Sidecar error: ${res.status}` },
      { status: 502 }
    );
  }

  if (stream) {
    // Pass-through SSE stream from sidecar
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  // Non-streaming: buffer the SSE stream
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  const errors: string[] = [];
  let exitCode: number | null = null;
  let timedOut = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    for (const line of text.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'stdout') chunks.push(event.text);
        else if (event.type === 'stderr') errors.push(event.text);
        else if (event.type === 'exit') exitCode = event.exitCode;
        else if (event.type === 'timeout') timedOut = true;
      } catch { /* ignore parse errors */ }
    }
  }

  return NextResponse.json({
    output: chunks.join(''),
    errors: errors.join(''),
    exitCode,
    timedOut,
    truncated: false,
  });
}

function mapTypeToCLI(type: string): string {
  const map: Record<string, string> = {
    claude_code: 'claude',
    codex: 'codex',
    hermes: 'hermes',
    openclaw: 'openclaw',
    custom: 'claude',
  };
  return map[type] || 'claude';
}

// ── Direct spawn: SSE streaming ──────────────────────────────────

async function runStreaming(
  spawnConfig: ReturnType<typeof buildSpawnConfig>,
  prompt: string,
  agent: { type: string; name: string; gitName: string | null; gitEmail: string | null },
  projectId?: string,
  taskId?: string,
  agentId?: string
): Promise<NextResponse> {
  const encoder = new TextEncoder();

  await defaultLimiter.acquire();

  const readable = new ReadableStream({
    async start(controller) {
      const heartbeatMs = spawnConfig.timeoutMs > 120_000 ? 120_000 : spawnConfig.timeoutMs;
      const signal = AbortSignal.timeout(spawnConfig.timeoutMs);

      let exitCode: number | null = null;
      let timedOut = false;
      let hadError = false;

      try {
        for await (const event of runAgentStream(spawnConfig, prompt, { heartbeatMs, signal })) {
          const line = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(line));

          if (event.type === 'exit') { exitCode = event.exitCode ?? null; break; }
          if (event.type === 'timeout') { timedOut = true; break; }
          if (event.type === 'error') { hadError = true; break; }
        }
      } catch (err: any) {
        const line = `data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`;
        try { controller.enqueue(encoder.encode(line)); } catch {}
        hadError = true;
      }

      // Post-execution: auto-commit + PR if task context provided and execution succeeded
      if (projectId && taskId && exitCode === 0 && !timedOut && !hadError) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'post_action', action: 'commit', status: 'started', message: '提交代码变更...' })}\n\n`));

          const result = await runAutoPR({
            projectId,
            taskId,
            agentName: agent.gitName || agent.name,
            agentEmail: agent.gitEmail || undefined,
          });

          if (result.error) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'post_action', action: 'commit', status: 'error', message: result.error })}\n\n`));
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'post_action', action: 'commit', status: 'done', branch: result.branch, commitSha: result.commitSha, message: `已提交到 ${result.branch}` })}\n\n`));

            if (result.prNumber) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'post_action', action: 'pr', status: 'done', prNumber: result.prNumber, prUrl: result.prUrl, message: `PR #${result.prNumber} 已创建` })}\n\n`));
            }
          }
        } catch (err: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'post_action', action: 'error', status: 'error', message: `Post-execution error: ${err.message}` })}\n\n`));
        }
      }

      defaultLimiter.release();
      try { controller.close(); } catch {}
    },
  });

  return new NextResponse(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Agent-Id': agentId || 'unknown',
    },
  });
}

// ── Direct spawn: sync ───────────────────────────────────────────

async function runSync(
  spawnConfig: ReturnType<typeof buildSpawnConfig>,
  prompt: string,
  agent: { type: string; name: string; gitName: string | null; gitEmail: string | null },
  projectId?: string,
  taskId?: string
): Promise<NextResponse> {
  await defaultLimiter.acquire();
  const chunks: string[] = [];
  const errors: string[] = [];
  let exitCode: number | null = null;
  let timedOut = false;

  try {
    const heartbeatMs = spawnConfig.timeoutMs > 120_000 ? 120_000 : spawnConfig.timeoutMs;
    const signal = AbortSignal.timeout(spawnConfig.timeoutMs);

    for await (const event of runAgentStream(spawnConfig, prompt, { heartbeatMs, signal })) {
      if (event.type === 'stdout') chunks.push(event.data!);
      else if (event.type === 'stderr') errors.push(event.data!);
      else if (event.type === 'timeout') timedOut = true;
      else if (event.type === 'exit') exitCode = event.exitCode ?? null;
      else if (event.type === 'error') { errors.push(event.error!); break; }
    }
  } catch (err: any) {
    errors.push(err.message);
  } finally {
    defaultLimiter.release();
  }

  // Post-execution: auto-commit + PR
  let postAction: object | null = null;
  if (projectId && taskId && exitCode === 0 && !timedOut && errors.length === 0) {
    try {
      const result = await runAutoPR({
        projectId,
        taskId,
        agentName: agent.gitName || agent.name,
        agentEmail: agent.gitEmail || undefined,
      });
      postAction = {
        branch: result.branch,
        commitSha: result.commitSha,
        prNumber: result.prNumber,
        prUrl: result.prUrl,
        error: result.error,
      };
    } catch (err: any) {
      postAction = { error: err.message };
    }
  }

  return NextResponse.json({
    output: chunks.join(''),
    errors: errors.join(''),
    exitCode,
    timedOut,
    truncated: false,
    errorHint: classifyStderr(errors.join('')),
    postAction,
  });
}
