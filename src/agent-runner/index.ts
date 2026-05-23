#!/usr/bin/env -S npx tsx
/**
 * Agent Runner Sidecar
 *
 * Standalone HTTP process that manages AI CLI execution.
 * Runs independently from Next.js — start with:
 *   npx tsx src/agent-runner/index.ts
 *   or: pm2 start src/agent-runner/index.ts --name agent-runner
 *
 * Endpoints:
 *   GET  /health            — health check
 *   GET  /discover          — list detected CLIs on this machine
 *   POST /execute           — execute a CLI prompt, returns SSE stream
 *   GET  /execute/:id       — subscribe to an existing execution stream
 *
 * MCP (Model Context Protocol) endpoints:
 *   POST /mcp               — JSON-RPC 2.0: initialize, tools/list, tools/call
 *   GET  /mcp/sse           — SSE transport for MCP server→client notifications
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { spawn, execSync, ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';

// ── Config ───────────────────────────────────────────────────────

const PORT = parseInt(process.env.AGENT_RUNNER_PORT || '4100', 10);
const MAX_CONCURRENT = parseInt(process.env.AGENT_RUNNER_MAX_CONCURRENT || '3', 10);
const DEFAULT_TIMEOUT_MS = parseInt(process.env.AGENT_RUNNER_TIMEOUT || '600000', 10);
const HEARTBEAT_MS = parseInt(process.env.AGENT_RUNNER_HEARTBEAT || '120000', 10);
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

// ── CLI Discovery ────────────────────────────────────────────────

const KNOWN_CLIS = [
  'claude', 'codex', 'copilot', 'openclaw', 'opencode',
  'hermes', 'gemini', 'pi', 'cursor-agent', 'kimi', 'kiro-cli',
];

interface DiscoveredCLI {
  bin: string;
  found: boolean;
  path: string | null;
  version: string | null;
}

function discoverCLIs(): DiscoveredCLI[] {
  return KNOWN_CLIS.map((bin) => {
    let path: string | null = null;
    let version: string | null = null;
    try {
      path = execSync(`which ${bin} 2>/dev/null`, { encoding: 'utf-8', timeout: 3000 }).trim();
      if (!path) throw new Error('not found');
      try {
        version = execSync(`${bin} --version 2>&1 || true`, { encoding: 'utf-8', timeout: 5000 })
          .trim().split('\n')[0].slice(0, 200);
      } catch { /* ignore */ }
    } catch { /* not found */ }
    return { bin, found: !!path, path, version };
  });
}

// ── Execution State ──────────────────────────────────────────────

interface Execution {
  id: string;
  cli: string;
  prompt: string;
  process: ChildProcess;
  startedAt: number;
  subscribers: Set<ServerResponse>;
}

const executions = new Map<string, Execution>();
let activeCount = 0;
const waitingQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitingQueue.push(resolve));
}

function releaseSlot() {
  activeCount--;
  const next = waitingQueue.shift();
  if (next) { activeCount++; next(); }
}

// ── SSE Helpers ──────────────────────────────────────────────────

function sendEvent(res: ServerResponse, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Keep named-event variant for MCP SSE transport only
function sendSSE(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sseHeaders(res: ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
}

// ── Route: Execute ───────────────────────────────────────────────

async function handleExecute(req: IncomingMessage, res: ServerResponse) {
  const body = await readBody(req);
  let parsed: { cli?: string; prompt?: string };
  try { parsed = JSON.parse(body); } catch {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'invalid JSON' }));
    return;
  }

  const { cli = 'claude', prompt } = parsed;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'prompt is required' }));
    return;
  }

  if (activeCount >= MAX_CONCURRENT) {
    res.writeHead(429);
    res.end(JSON.stringify({
      error: 'Too many agents running',
      queuePosition: waitingQueue.length + 1,
    }));
    return;
  }

  // Build args
  const args = buildArgs(cli, prompt);
  const execId = randomBytes(8).toString('hex');

  sseHeaders(res);

  await acquireSlot();

  const child = spawn(cli, args, {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let totalOutput = 0;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  const exec: Execution = {
    id: execId,
    cli,
    prompt,
    process: child,
    startedAt: Date.now(),
    subscribers: new Set([res]),
  };
  executions.set(execId, exec);

  const finish = (type: string, data: Record<string, unknown>) => {
    if (settled) return;
    settled = true;
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    sendEvent(res, { type, ...data });
    executions.delete(execId);
    releaseSlot();
    res.end();
  };

  const resetHeartbeat = () => {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
      child.kill('SIGKILL');
      finish('timeout', { message: 'Heartbeat timeout' });
    }, HEARTBEAT_MS);
  };
  resetHeartbeat();

  // Global timeout
  const globalTimeout = setTimeout(() => {
    child.kill('SIGKILL');
    finish('timeout', { message: 'Global timeout' });
  }, DEFAULT_TIMEOUT_MS);

  child.stdout!.on('data', (chunk: Buffer) => {
    totalOutput += chunk.length;
    if (totalOutput > MAX_OUTPUT_BYTES) {
      child.kill('SIGKILL');
      finish('error', { error: 'Output exceeded 10MB limit' });
      return;
    }
    resetHeartbeat();
    sendEvent(res, { type: 'stdout', data: chunk.toString() });
  });

  child.stderr!.on('data', (chunk: Buffer) => {
    resetHeartbeat();
    sendEvent(res, { type: 'stderr', data: chunk.toString() });
  });

  child.on('close', (code) => {
    clearTimeout(globalTimeout);
    finish('exit', { exitCode: code });
  });

  child.on('error', (err) => {
    clearTimeout(globalTimeout);
    finish('error', { error: err.message });
  });
}

function buildArgs(cli: string, prompt: string): string[] {
  switch (cli) {
    case 'claude':
      return ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
    case 'codex':
      return ['exec', prompt];
    case 'hermes':
      return ['--prompt', prompt];
    default:
      return [prompt];
  }
}

// ── Route Handlers ───────────────────────────────────────────────

function handleHealth(_req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    activeCount,
    maxConcurrent: MAX_CONCURRENT,
    queueLength: waitingQueue.length,
    uptime: process.uptime(),
  }));
}

function handleDiscover(_req: IncomingMessage, res: ServerResponse) {
  const clis = discoverCLIs();
  const found = clis.filter((c) => c.found);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    clis,
    found: found.length,
    total: clis.length,
    best: found[0]?.bin ?? null,
  }));
}

function handleCors(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end();
}

function handleNotFound(_req: IncomingMessage, res: ServerResponse) {
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
}

// ── MCP (Model Context Protocol) ─────────────────────────────────

const SERVER_NAME = 'agent-runner';
const SERVER_VERSION = '1.0.0';

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const MCP_TOOLS = [
  {
    name: 'claude_code_execute',
    description: 'Execute a prompt using Claude Code CLI. Claude Code is Anthropic\'s agentic coding tool that can read, write, and edit files, run commands, and manage complex multi-step tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt/instruction for Claude Code to execute' },
        cwd: { type: 'string', description: 'Working directory for execution' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'codex_execute',
    description: 'Execute a prompt using Codex CLI (OpenAI). Codex is a coding agent that works in the terminal.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt/instruction for Codex to execute' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'agent_execute',
    description: 'Execute a prompt using any detected AI CLI on this machine. The CLI is auto-selected based on availability.',
    inputSchema: {
      type: 'object',
      properties: {
        cli: { type: 'string', description: 'The CLI binary to use (claude, codex, hermes, etc.)' },
        prompt: { type: 'string', description: 'The prompt/instruction to execute' },
      },
      required: ['cli', 'prompt'],
    },
  },
];

async function handleMCP(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  let rpc: JSONRPCRequest;
  try { rpc = JSON.parse(body); } catch {
    sendJSON(res, 400, jsonrpcError(null, -32700, 'Parse error'));
    return;
  }

  if (rpc.jsonrpc !== '2.0') {
    sendJSON(res, 400, jsonrpcError(rpc.id, -32600, 'Invalid Request'));
    return;
  }

  try {
    switch (rpc.method) {
      case 'initialize':
        sendJSON(res, 200, jsonrpcResult(rpc.id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        }));
        break;

      case 'tools/list':
        sendJSON(res, 200, jsonrpcResult(rpc.id, { tools: MCP_TOOLS }));
        break;

      case 'tools/call': {
        const params = rpc.params as { name?: string; arguments?: Record<string, string> } | undefined;
        if (!params?.name || !params?.arguments) {
          sendJSON(res, 400, jsonrpcError(rpc.id, -32602, 'Invalid params'));
          return;
        }

        const tool = MCP_TOOLS.find((t) => t.name === params.name);
        if (!tool) {
          sendJSON(res, 404, jsonrpcError(rpc.id, -32601, `Unknown tool: ${params.name}`));
          return;
        }

        const toolArgs = params.arguments as { cli?: string; prompt: string; cwd?: string };
        const cli = toolArgs.cli || (params.name === 'codex_execute' ? 'codex' : 'claude');
        const prompt = toolArgs.prompt;
        const cwd = toolArgs.cwd;

        if (!prompt) {
          sendJSON(res, 400, jsonrpcError(rpc.id, -32602, 'Missing required parameter: prompt'));
          return;
        }

        // Execute the CLI and collect output
        const output = await executeCliForMCP(cli, prompt, cwd);

        sendJSON(res, 200, jsonrpcResult(rpc.id, {
          content: [{ type: 'text', text: output.output }],
          isError: output.exitCode !== 0,
          exitCode: output.exitCode,
          stderr: output.errors || undefined,
        }));
        break;
      }

      case 'notifications/initialized':
        sendJSON(res, 200, jsonrpcResult(rpc.id, {}));
        break;

      default:
        sendJSON(res, 404, jsonrpcError(rpc.id, -32601, `Method not found: ${rpc.method}`));
    }
  } catch (err: any) {
    sendJSON(res, 500, jsonrpcError(rpc.id, -32603, `Internal error: ${err.message}`));
  }
}

function executeCliForMCP(cli: string, prompt: string, cwd?: string): Promise<{
  output: string;
  errors: string;
  exitCode: number | null;
  timedOut: boolean;
}> {
  return new Promise((resolve) => {
    const args = buildArgs(cli, prompt);
    const child = spawn(cli, args, {
      env: { ...process.env },
      cwd: cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const chunks: string[] = [];
    const errors: string[] = [];
    let totalOutput = 0;

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ output: chunks.join(''), errors: errors.join(''), exitCode: null, timedOut: true });
    }, DEFAULT_TIMEOUT_MS);

    child.stdout!.on('data', (chunk: Buffer) => {
      totalOutput += chunk.length;
      if (totalOutput > MAX_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        clearTimeout(timeout);
        resolve({ output: chunks.join(''), errors: '[truncated]', exitCode: null, timedOut: false });
        return;
      }
      chunks.push(chunk.toString());
    });

    child.stderr!.on('data', (chunk: Buffer) => {
      errors.push(chunk.toString());
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ output: chunks.join(''), errors: errors.join(''), exitCode: code, timedOut: false });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ output: chunks.join(''), errors: errors.join('') + err.message, exitCode: -1, timedOut: false });
    });
  });
}

function jsonrpcResult(id: number | string | undefined, result: unknown): JSONRPCResponse {
  return { jsonrpc: '2.0', id, result };
}

function jsonrpcError(id: number | string | undefined | null, code: number, message: string): JSONRPCResponse {
  return { jsonrpc: '2.0', id: id ?? undefined, error: { code, message } };
}

function sendJSON(res: ServerResponse, status: number, data: JSONRPCResponse) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function handleMCPSSE(req: IncomingMessage, res: ServerResponse) {
  sseHeaders(res);
  sendSSE(res, 'endpoint', { uri: `http://localhost:${PORT}/mcp` });
  // Keep alive — client will POST to /mcp for actual calls
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
}

// ── HTTP Server ──────────────────────────────────────────────────

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const method = req.method || 'GET';

  if (method === 'OPTIONS') return handleCors(req, res);

  if (url.pathname === '/health' && method === 'GET') return handleHealth(req, res);
  if (url.pathname === '/discover' && method === 'GET') return handleDiscover(req, res);
  if (url.pathname === '/execute' && method === 'POST') return handleExecute(req, res);
  if (url.pathname === '/mcp' && method === 'POST') { handleMCP(req, res); return; }
  if (url.pathname === '/mcp/sse' && method === 'GET') { handleMCPSSE(req, res); return; }

  handleNotFound(req, res);
});

// ── Helpers ──────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

// ── Startup ──────────────────────────────────────────────────────

server.listen(PORT, () => {
  const clis = discoverCLIs();
  const found = clis.filter((c) => c.found);
  console.log(`[agent-runner] listening on http://localhost:${PORT}`);
  console.log(`[agent-runner] max concurrent: ${MAX_CONCURRENT}, timeout: ${DEFAULT_TIMEOUT_MS}ms, heartbeat: ${HEARTBEAT_MS}ms`);
  console.log(`[agent-runner] detected ${found.length}/${clis.length} CLIs: ${found.map(c => c.bin).join(', ') || 'none'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[agent-runner] shutting down...');
  executions.forEach((exec) => {
    exec.process.kill('SIGTERM');
  });
  server.close();
  process.exit(0);
});
