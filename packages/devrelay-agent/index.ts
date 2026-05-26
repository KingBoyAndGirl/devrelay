#!/usr/bin/env -S npx tsx
/**
 * DevRelay Agent
 *
 * Host-side process that manages AI CLI execution for DevRelay.
 *
 * Usage:
 *   devrelay                     Start the agent server (default)
 *   devrelay configure           Interactive setup (token, URL)
 *   devrelay configure --token X --url Y
 *   devrelay start               Same as no args
 *   devrelay status              Show config & health
 *   devrelay test                Test connection to DevRelay server
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { spawn, execSync, fork, ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';

const PID_FILE = join(homedir(), '.devrelay', 'agent.pid');
let VERSION = 'dev';
try {
  const pkgPath = join(__dirname || dirname(process.argv[1]), 'package.json');
  VERSION = JSON.parse(readFileSync(pkgPath, 'utf-8')).version || 'dev';
} catch {
  // fallback for source tree
  try {
    const srcPkg = join(process.cwd(), 'packages', 'devrelay-agent', 'package.json');
    VERSION = JSON.parse(readFileSync(srcPkg, 'utf-8')).version || 'dev';
  } catch {}
}

// ── Config File ──────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), '.devrelay');
const CONFIG_FILE = join(CONFIG_DIR, 'agent.json');

interface AgentConfig {
  token?: string;
  serverUrl?: string;
  port?: number;
  maxConcurrent?: number;
  timeoutMs?: number;
  heartbeatMs?: number;
}

function loadConfig(): AgentConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveConfig(config: AgentConfig) {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
}

function resolveConfig(): {
  port: number;
  token: string;
  serverUrl: string;
  maxConcurrent: number;
  timeoutMs: number;
  heartbeatMs: number;
} {
  const file = loadConfig();
  return {
    port: file.port || parseInt(process.env.DEVRELAY_AGENT_PORT || '4100', 10),
    token: file.token || process.env.DEVRELAY_AGENT_TOKEN || '',
    serverUrl: file.serverUrl || process.env.DEVRELAY_AGENT_URL || '',
    maxConcurrent: file.maxConcurrent || parseInt(process.env.DEVRELAY_AGENT_MAX_CONCURRENT || '3', 10),
    timeoutMs: file.timeoutMs || parseInt(process.env.DEVRELAY_AGENT_TIMEOUT || '600000', 10),
    heartbeatMs: file.heartbeatMs || parseInt(process.env.DEVRELAY_AGENT_HEARTBEAT || '120000', 10),
  };
}

// ── CLI Argument Parsing ─────────────────────────────────────────

function parseArgs(): { command: string; flags: Record<string, string> } {
  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};
  let command = 'start';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      command = 'help';
    } else if (args[i] === '--version' || args[i] === '-v') {
      command = 'version';
    } else if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      flags[key] = val;
    } else if (i === 0 || (command === 'start' && args[i] !== 'start')) {
      command = args[i];
    }
  }
  return { command, flags };
}

// ── Commands ─────────────────────────────────────────────────────

async function cmdConfigure(flags: Record<string, string>) {
  const config = loadConfig();

  if (flags.token || flags.url) {
    // Non-interactive mode
    if (flags.token) config.token = flags.token;
    if (flags.url) config.serverUrl = flags.url;
    if (flags.port) config.port = parseInt(flags.port, 10);
    saveConfig(config);
    console.log('[devrelay] Configuration saved to', CONFIG_FILE);
    if (config.token) console.log('  Token:    ' + config.token.slice(0, 8) + '...');
    if (config.serverUrl) console.log('  Server:   ' + config.serverUrl);
    if (config.port) console.log('  Port:     ' + config.port);
    return;
  }

  // Interactive mode
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string, def = '') => new Promise<string>((resolve) => {
    rl.question(q + (def ? ` (${def})` : '') + ': ', (ans) => resolve(ans.trim() || def));
  });

  console.log('\n  DevRelay Agent Configuration\n');

  config.token = await ask('  Agent Token (from DevRelay web UI)', config.token || '');
  config.serverUrl = await ask('  DevRelay Server URL', config.serverUrl || 'http://localhost:3000');
  const portStr = await ask('  Agent Port', String(config.port || 4100));
  config.port = parseInt(portStr, 10);

  rl.close();
  saveConfig(config);

  console.log('\n  Configuration saved to', CONFIG_FILE);
  console.log('  Start the agent with: devrelay start\n');
}

function cmdStatus() {
  const config = resolveConfig();

  console.log('\n  DevRelay Agent Status');
  console.log('  ────────────────────');
  console.log('  Version:      ' + VERSION);
  console.log('  Config:       ' + CONFIG_FILE);
  console.log('  Port:         ' + config.port);
  console.log('  Token:        ' + (config.token ? config.token.slice(0, 8) + '...' : '(not set)'));
  console.log('  Server URL:   ' + (config.serverUrl || '(not set)'));
  console.log('  Max concurrent: ' + config.maxConcurrent);
  console.log('  Timeout:      ' + (config.timeoutMs / 1000) + 's');
  console.log('');

  // Sync status to server
  if (config.token && config.serverUrl) {
    console.log('  Syncing status to server...');
    notifyOnline(config);
  }

  // Health check + discover CLIs
  const http = require('http');
  const req = http.get(`http://localhost:${config.port}/health`, { timeout: 2000 }, (res: any) => {
    let data = '';
    res.on('data', (chunk: any) => data += chunk);
    res.on('end', () => {
      try {
        const health = JSON.parse(data);
        console.log('  Status:       RUNNING');
        console.log('  Active:       ' + health.activeCount + '/' + health.maxConcurrent);
        console.log('  Queue:        ' + health.queueLength);
        console.log('  Uptime:       ' + Math.floor(health.uptime) + 's');
      } catch {
        console.log('  Status:       RUNNING (unexpected response)');
      }
      // Fetch CLI versions from /discover
      const headers = config.token ? { Authorization: `Bearer ${config.token}` } : {};
      const discoverReq = http.get(`http://localhost:${config.port}/discover`, { headers, timeout: 2000 }, (dRes: any) => {
        let dData = '';
        dRes.on('data', (chunk: any) => dData += chunk);
        dRes.on('end', () => {
          try {
            const info = JSON.parse(dData);
            const found = (info.clis || []).filter((c: any) => c.found);
            if (found.length > 0) {
              console.log('');
              console.log('  Detected CLIs:');
              for (const cli of found) {
                console.log('    ' + cli.bin.padEnd(16) + (cli.version || '(unknown)'));
              }
            }
          } catch {}
          console.log('');
        });
      });
      discoverReq.on('error', () => { console.log(''); });
    });
  });
  req.on('error', () => {
    console.log('  Status:       STOPPED');
    console.log('');
  });
}

async function cmdTest() {
  const config = resolveConfig();

  if (!config.serverUrl) {
    console.error('[devrelay] No server URL configured. Run: devrelay configure');
    process.exit(1);
  }

  if (!config.token) {
    console.error('[devrelay] No token configured. Run: devrelay configure');
    process.exit(1);
  }

  console.log(`[devrelay] Testing connection to ${config.serverUrl}...`);

  try {
    const res = await fetch(`${config.serverUrl}/api/agent/verify`, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        'X-Agent-Version': VERSION,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      console.log('[devrelay] Connection successful');
      console.log(`  Server responded: HTTP ${res.status}`);
      if (data.workspace) {
        console.log(`  Workspace:    ${data.workspace.name} (${data.workspace.slug})`);
      }
    } else {
      const data = await res.json().catch(() => ({}));
      console.log(`[devrelay] Server responded: HTTP ${res.status}`);
      if (res.status === 401) {
        console.log('  Token is invalid. Generate a new one in the workspace settings page.');
      } else {
        console.log('  ' + (data.error || 'Unknown error'));
      }
    }
  } catch (err: any) {
    console.error(`[devrelay] Connection failed: ${err.message}`);
    console.log('  Check that the DevRelay server is running and accessible.');
  }
}

function cmdHelp() {
  console.log(`
  DevRelay Agent — AI CLI execution sidecar

  Usage:
    devrelay [command] [options]

  Commands:
    start               Start the agent server (default)
    start --daemon       Start in background
    stop                Stop the running agent
    restart             Restart the agent server
    configure           Interactive setup (token, server URL, port)
    status              Show configuration and health
    test                Test connection to DevRelay server
    version             Show version
    help                Show this help

  Configure options:
    --token <string>    Agent authentication token
    --url <string>      DevRelay server URL
    --port <number>     Agent listening port (default: 4100)
    --daemon            Run in background (for start/restart)
    --version, -v       Show version

  Examples:
    devrelay configure --token abc123 --url https://devrelay.example.com
    devrelay start --daemon
    devrelay restart
    devrelay status

  Config file: ~/.devrelay/agent.json
  Environment variables (override config file):
    DEVRELAY_AGENT_TOKEN, DEVRELAY_AGENT_URL, DEVRELAY_AGENT_PORT
`);
}

function getPortPid(port: number): number | null {
  try {
    const output = execSync(`ss -tlnp sport = :${port} 2>/dev/null | grep -oP 'pid=\\K[0-9]+'`, { encoding: 'utf-8' }).trim();
    return output ? parseInt(output, 10) : null;
  } catch {
    return null;
  }
}

// Notify server that agent is going offline (synchronous, blocks until done)
function notifyOffline(cfg: AgentConfig = resolveConfig()) {
  if (!cfg.token || !cfg.serverUrl) return;
  try {
    const url = `${cfg.serverUrl}/api/agent/disconnect`;
    execSync(`curl -s -X POST -H "Authorization: Bearer ${cfg.token}" -m 3 "${url}"`, { timeout: 5000 });
  } catch {}
}

// Ping server to sync online status (synchronous, blocks until done)
function notifyOnline(cfg: AgentConfig = resolveConfig()) {
  if (!cfg.token || !cfg.serverUrl) return;
  try {
    const url = `${cfg.serverUrl}/api/agent/verify`;
    execSync(`curl -s -H "Authorization: Bearer ${cfg.token}" -H "X-Agent-Version: ${VERSION}" -m 3 "${url}"`, { timeout: 5000 });
  } catch {}
}

function cmdStop() {
  const cfg = resolveConfig();
  console.log(`[devrelay] Stopping agent v${VERSION}...`);
  // Sync offline status to server before killing
  if (cfg.token && cfg.serverUrl) {
    console.log(`[devrelay] Syncing offline status to server...`);
  }
  notifyOffline(cfg);
  // Try PID file first, then port detection
  let pid: number | null = null;
  if (existsSync(PID_FILE)) {
    try { pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10); } catch {}
  }
  if (!pid) pid = getPortPid(cfg.port);
  if (!pid) {
    console.log(`[devrelay] No agent process found`);
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`[devrelay] Stopped agent (pid ${pid})`);
    try { unlinkSync(PID_FILE); } catch {}
  } catch (err: any) {
    console.error(`[devrelay] Failed to stop pid ${pid}: ${err.message}`);
  }
}

function startDaemon(flags: Record<string, string>) {
  const cfg = resolveConfig();
  if (flags.port) cfg.port = parseInt(flags.port, 10);
  const port = cfg.port;
  // Kill existing process if any
  const pid = getPortPid(port);
  if (pid) {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
  const bin = process.argv[1];
  // Reuse the same tsx loader that's running this process (via process.execArgv)
  const args = [...process.execArgv, bin, 'start', '--port', String(port)];
  const child = spawn(process.argv[0], args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  if (child.pid) {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(PID_FILE, String(child.pid));
    console.log(`[devrelay] Agent started in background (pid ${child.pid}) on port ${port}`);
  }
  process.exit(0);
}

function cmdRestart(flags: Record<string, string>) {
  const cfg = resolveConfig();
  if (flags.port) cfg.port = parseInt(flags.port, 10);
  console.log(`\n[devrelay] Restarting agent v${VERSION}...`);
  // Notify server: going offline then will come back online
  notifyOffline(cfg);
  const pid = getPortPid(cfg.port);
  if (pid) {
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`[devrelay] Stopped agent (pid ${pid})`);
    } catch {}
  }
  setTimeout(() => startServer(flags), 500);
}

// ── CLI Dispatch ─────────────────────────────────────────────────

const { command, flags } = parseArgs();

switch (command) {
  case 'version':
  case '--version':
  case '-v':
    console.log(`devrelay-agent@${VERSION}`);
    break;
  case 'configure':
    cmdConfigure(flags).then(() => process.exit(0));
    break;
  case 'status':
    cmdStatus();
    break;
  case 'test':
    cmdTest().then(() => process.exit(0));
    break;
  case 'stop':
    cmdStop();
    break;
  case 'restart':
    if (flags.daemon) {
      startDaemon(flags);
    } else {
      cmdRestart(flags);
    }
    break;
  case 'help':
  case '--help':
  case '-h':
    cmdHelp();
    break;
  case 'start':
  default:
    if (flags.daemon) {
      startDaemon(flags);
    } else {
      startServer(flags);
    }
    break;
}

// ── Server ───────────────────────────────────────────────────────

function startServer(flags: Record<string, string> = {}) {
  const cfg = resolveConfig();
  if (flags.port) cfg.port = parseInt(flags.port, 10);
  const PORT = cfg.port;
  const AUTH_TOKEN = cfg.token;
  const MAX_CONCURRENT = cfg.maxConcurrent;
  const DEFAULT_TIMEOUT_MS = cfg.timeoutMs;
  const HEARTBEAT_MS = cfg.heartbeatMs;
  const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

  // ── CLI Discovery ────────────────────────────────────────────

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

  // ── Auth ─────────────────────────────────────────────────────

  function checkAuth(req: IncomingMessage): boolean {
    if (!AUTH_TOKEN) return true;
    const header = req.headers.authorization || '';
    return header === `Bearer ${AUTH_TOKEN}`;
  }

  function sendUnauthorized(res: ServerResponse) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized: invalid or missing token' }));
  }

  // ── Execution State ──────────────────────────────────────────

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

  // ── SSE Helpers ──────────────────────────────────────────────

  function sendEvent(res: ServerResponse, data: Record<string, unknown>) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

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

  // ── Build CLI Args ───────────────────────────────────────────

  function buildArgs(cli: string, prompt: string, sessionId?: string): string[] {
    switch (cli) {
      case 'claude':
        return sessionId
          ? ['-p', prompt, '--resume', sessionId, '--output-format', 'stream-json', '--verbose']
          : ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
      case 'codex':   return ['--skip-git-repo-check', 'exec', prompt];
      case 'hermes':
        return sessionId
          ? ['-z', prompt, '--continue', 'chat']
          : ['-z', prompt, 'chat'];
      default:        return [prompt];
    }
  }

  // ── Route: Execute ───────────────────────────────────────────

  async function handleExecute(req: IncomingMessage, res: ServerResponse) {
    const body = await readBody(req);
    let parsed: { cli?: string; prompt?: string; envVars?: Record<string, string>; sessionId?: string };
    try { parsed = JSON.parse(body); } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'invalid JSON' }));
      return;
    }

    const { cli = 'claude', prompt, envVars, sessionId } = parsed;
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

    const args = buildArgs(cli, prompt, sessionId);
    const execId = randomBytes(8).toString('hex');

    sseHeaders(res);

    await acquireSlot();

    const child = spawn(cli, args, {
      env: { ...process.env, ...(envVars as Record<string, string> || {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin!.end();

    let totalOutput = 0;
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const exec: Execution = {
      id: execId, cli, prompt,
      process: child, startedAt: Date.now(),
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

  // ── Route Handlers ───────────────────────────────────────────

  function handleHealth(_req: IncomingMessage, res: ServerResponse) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      activeCount, maxConcurrent: MAX_CONCURRENT,
      queueLength: waitingQueue.length,
      uptime: process.uptime(),
    }));
  }

  function handleDiscover(_req: IncomingMessage, res: ServerResponse) {
    const clis = discoverCLIs();
    const found = clis.filter((c) => c.found);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      clis, found: found.length, total: clis.length,
      best: found[0]?.bin ?? null,
    }));
  }

  function handleCors(_req: IncomingMessage, res: ServerResponse) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
  }

  function handleNotFound(_req: IncomingMessage, res: ServerResponse) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  }

  const NATIVE_UPDATE: Record<string, string> = {
    claude: 'claude update',
    codex: 'codex update',
    hermes: 'hermes update',
  };

  async function handleUpdate(req: IncomingMessage, res: ServerResponse) {
    try {
      const body = JSON.parse(await readBody(req));
      const { cli, package: pkg } = body as { cli?: string; package?: string };

      if (!cli && !pkg) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing "cli" or "package" field' }));
        return;
      }

      let output: string;
      let updateTarget: string;

      if (cli) {
        if (!NATIVE_UPDATE[cli]) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `unsupported CLI: ${cli}` }));
          return;
        }
        updateTarget = cli;
        console.log(`[devrelay] Running native update: ${NATIVE_UPDATE[cli]}`);
        output = execSync(`${NATIVE_UPDATE[cli]} 2>&1`, {
          timeout: 120000,
          encoding: 'utf-8',
        });
      } else {
        if (!/^(@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*(@[^\s]+)?$/.test(pkg!)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid package name' }));
          return;
        }
        updateTarget = pkg!;
        console.log(`[devrelay] npm install -g: ${pkg}`);
        output = execSync(`npm install -g ${pkg} 2>&1`, {
          timeout: 120000,
          encoding: 'utf-8',
          env: { ...process.env, npm_config_loglevel: 'silent' },
        });
      }

      // Read new version
      let newVersion: string | null = null;
      try {
        const bin = cli || (pkg!.startsWith('@') ? pkg!.split('/')[1] : pkg!);
        newVersion = execSync(`${bin} --version 2>/dev/null || npm list -g ${pkg || cli} --depth=0 --json 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(Object.values(d.dependencies||{})[0]?.version||'')"`, { encoding: 'utf-8', timeout: 10000 }).trim() || null;
      } catch {}

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, package: updateTarget, newVersion, output: output.trim().slice(-500) }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'update failed' }));
    }
  }

  // ── MCP ──────────────────────────────────────────────────────

  const SERVER_NAME = 'devrelay';
  const SERVER_VERSION = '1.0.0';

  const MCP_TOOLS = [
    {
      name: 'claude_code_execute',
      description: 'Execute a prompt using Claude Code CLI.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The prompt for Claude Code' },
          cwd: { type: 'string', description: 'Working directory' },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'codex_execute',
      description: 'Execute a prompt using Codex CLI (OpenAI).',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The prompt for Codex' },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'agent_execute',
      description: 'Execute a prompt using any detected AI CLI.',
      inputSchema: {
        type: 'object',
        properties: {
          cli: { type: 'string', description: 'CLI binary to use' },
          prompt: { type: 'string', description: 'The prompt to execute' },
        },
        required: ['cli', 'prompt'],
      },
    },
  ];

  async function handleMCP(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    let rpc: any;
    try { rpc = JSON.parse(body); } catch {
      sendJSON(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }

    if (rpc.jsonrpc !== '2.0') {
      sendJSON(res, 400, { jsonrpc: '2.0', id: rpc.id, error: { code: -32600, message: 'Invalid Request' } });
      return;
    }

    try {
      switch (rpc.method) {
        case 'initialize':
          sendJSON(res, 200, {
            jsonrpc: '2.0', id: rpc.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            },
          });
          break;
        case 'tools/list':
          sendJSON(res, 200, { jsonrpc: '2.0', id: rpc.id, result: { tools: MCP_TOOLS } });
          break;
        case 'tools/call': {
          const params = rpc.params as { name?: string; arguments?: Record<string, string> } | undefined;
          if (!params?.name || !params?.arguments) {
            sendJSON(res, 400, { jsonrpc: '2.0', id: rpc.id, error: { code: -32602, message: 'Invalid params' } });
            return;
          }
          const tool = MCP_TOOLS.find((t) => t.name === params.name);
          if (!tool) {
            sendJSON(res, 404, { jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: `Unknown tool: ${params.name}` } });
            return;
          }
          const toolArgs = params.arguments as { cli?: string; prompt: string; cwd?: string };
          const cli = toolArgs.cli || (params.name === 'codex_execute' ? 'codex' : 'claude');
          if (!toolArgs.prompt) {
            sendJSON(res, 400, { jsonrpc: '2.0', id: rpc.id, error: { code: -32602, message: 'Missing prompt' } });
            return;
          }
          const output = await executeCliForMCP(cli, toolArgs.prompt, toolArgs.cwd);
          sendJSON(res, 200, {
            jsonrpc: '2.0', id: rpc.id,
            result: {
              content: [{ type: 'text', text: output.output }],
              isError: output.exitCode !== 0,
            },
          });
          break;
        }
        case 'notifications/initialized':
          sendJSON(res, 200, { jsonrpc: '2.0', id: rpc.id, result: {} });
          break;
        default:
          sendJSON(res, 404, { jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: `Method not found: ${rpc.method}` } });
      }
    } catch (err: any) {
      sendJSON(res, 500, { jsonrpc: '2.0', id: rpc.id, error: { code: -32603, message: `Internal error: ${err.message}` } });
    }
  }

  function executeCliForMCP(cli: string, prompt: string, cwd?: string): Promise<{
    output: string; exitCode: number | null;
  }> {
    return new Promise((resolve) => {
      const args = buildArgs(cli, prompt);
      const child = spawn(cli, args, {
        env: { ...process.env },
        cwd: cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      child.stdin!.end();
      const chunks: string[] = [];
      let totalOutput = 0;
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({ output: chunks.join(''), exitCode: null });
      }, DEFAULT_TIMEOUT_MS);
      child.stdout!.on('data', (chunk: Buffer) => {
        totalOutput += chunk.length;
        if (totalOutput > MAX_OUTPUT_BYTES) {
          child.kill('SIGKILL');
          clearTimeout(timeout);
          resolve({ output: '[truncated]', exitCode: null });
          return;
        }
        chunks.push(chunk.toString());
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({ output: chunks.join(''), exitCode: code });
      });
      child.on('error', () => {
        clearTimeout(timeout);
        resolve({ output: chunks.join(''), exitCode: -1 });
      });
    });
  }

  function sendJSON(res: ServerResponse, status: number, data: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
  }

  function handleMCPSSE(req: IncomingMessage, res: ServerResponse) {
    sseHeaders(res);
    sendSSE(res, 'endpoint', { uri: `http://localhost:${PORT}/mcp` });
    const keepAlive = setInterval(() => { res.write(': keepalive\n\n'); }, 30000);
    req.on('close', () => { clearInterval(keepAlive); });
  }

  // ── HTTP Server ──────────────────────────────────────────────

  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const method = req.method || 'GET';

    if (method === 'OPTIONS') return handleCors(req, res);
    if (url.pathname !== '/health' && !checkAuth(req)) return sendUnauthorized(res);

    if (url.pathname === '/health' && method === 'GET') return handleHealth(req, res);
    if (url.pathname === '/discover' && method === 'GET') return handleDiscover(req, res);
    if (url.pathname === '/update' && method === 'POST') return handleUpdate(req, res);
    if (url.pathname === '/execute' && method === 'POST') return handleExecute(req, res);
    if (url.pathname === '/mcp' && method === 'POST') { handleMCP(req, res); return; }
    if (url.pathname === '/mcp/sse' && method === 'GET') { handleMCPSSE(req, res); return; }

    handleNotFound(req, res);
  });

  // ── Helpers ──────────────────────────────────────────────────

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
  }

  // ── Startup ──────────────────────────────────────────────────

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      const pid = getPortPid(PORT);
      console.log(`[devrelay] Port ${PORT} is already in use${pid ? ` (pid ${pid})` : ''}.`);
      if (pid) {
        console.log(`[devrelay] Killing old process ${pid}...`);
        try {
          process.kill(pid, 'SIGTERM');
          setTimeout(() => {
            server.listen(PORT);
          }, 500);
          return;
        } catch (killErr: any) {
          console.error(`[devrelay] Failed to kill pid ${pid}: ${killErr.message}`);
        }
      }
      console.log(`[devrelay] Run "devrelay stop" or "devrelay restart" to resolve.`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(PORT, () => {
    const clis = discoverCLIs();
    const found = clis.filter((c) => c.found);
    console.log(`\n[devrelay] ========================================`);
    console.log(`[devrelay]  Version     ${VERSION}`);
    console.log(`[devrelay]  Listening   http://localhost:${PORT}`);
    console.log(`[devrelay]  Auth:       ${AUTH_TOKEN ? 'ENABLED' : 'DISABLED'}`);
    console.log(`[devrelay]  Config:     ${CONFIG_FILE}`);
    if (found.length > 0) {
      console.log(`[devrelay]  CLIs:`);
      for (const cli of found) {
        console.log(`[devrelay]    ${cli.bin.padEnd(14)}${cli.version || '(unknown)'}`);
      }
    } else {
      console.log(`[devrelay]  CLIs:       none detected`);
    }
    console.log(`[devrelay] ========================================\n`);
  });

  // Heartbeat: re-verify token to keep online status fresh
  if (AUTH_TOKEN && cfg.serverUrl) {
    // Immediate sync: mark online right away
    fetch(`${cfg.serverUrl}/api/agent/verify`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});

    setInterval(() => {
      fetch(`${cfg.serverUrl}/api/agent/verify`, {
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }, 60_000);
  }

  process.on('SIGTERM', () => {
    console.log('[devrelay] shutting down...');
    notifyOffline();
    executions.forEach((exec) => exec.process.kill('SIGTERM'));
    server.close();
    process.exit(0);
  });
}
