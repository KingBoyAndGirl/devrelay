import { createServer } from 'http';
import { parse } from 'url';
import { spawn, ChildProcess } from 'child_process';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './src/lib/config';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
const sidecarPort = parseInt(process.env.DEVRELAY_AGENT_PORT || '4100', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let sidecarRestarts = 0;

function startSidecar(): ChildProcess | null {
  if (process.env.NO_SIDECAR) return null;

  const child = spawn('npx', ['tsx', 'src/devrelay-agent/index.ts'], {
    env: {
      ...process.env,
      DEVRELAY_AGENT_PORT: String(sidecarPort),
    },
    stdio: 'pipe',
  });

  child.stdout!.on('data', (chunk: Buffer) => {
    process.stdout.write(`[sidecar] ${chunk.toString().trim()}\n`);
  });

  child.stderr!.on('data', (chunk: Buffer) => {
    process.stderr.write(`[sidecar] ${chunk.toString().trim()}\n`);
  });

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      sidecarRestarts++;
      if (sidecarRestarts > 5) {
        console.error(`[devrelay] Sidecar crashed ${sidecarRestarts} times, giving up.`);
        return;
      }
      const delay = Math.min(1000 * Math.pow(2, sidecarRestarts), 30000);
      console.warn(`[devrelay] Sidecar exited with code ${code}, restart #${sidecarRestarts} in ${delay / 1000}s...`);
      setTimeout(() => startSidecar(), delay);
    }
  });

  return child;
}

app.prepare().then(async () => {
  const { initializeDatabase } = await import('./src/lib/db/client');
  const { ensureAdminUser } = await import('./src/lib/auth');
  const { ensureDataDir } = await import('./src/lib/docs');

  await ensureDataDir();
  await initializeDatabase();
  await ensureAdminUser();

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer(server, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    console.log(`[devrelay] Socket connected: ${socket.id}`);

    socket.on('subscribe', (userId: string) => {
      if (userId) {
        socket.join(`user:${userId}`);
        console.log(`[devrelay] User ${userId} subscribed to notifications`);
      }
    });
  });

  (globalThis as any).io = io;

  // Start agent sidecar
  const sidecar = startSidecar();
  if (sidecar) {
    process.on('SIGTERM', () => { sidecar.kill('SIGTERM'); });
    process.on('SIGINT',  () => { sidecar.kill('SIGINT'); });
  }

  server.listen(port, () => {
    console.log(`\n[devrelay] ========================================`);
    console.log(`[devrelay]  Server   http://${hostname}:${port}`);
    console.log(`[devrelay]  Sidecar  http://${hostname}:${sidecarPort}`);
    console.log(`[devrelay]  Data     ${config.dataDir}`);
    console.log(`[devrelay]  Admin    ${config.adminUser}`);
    console.log(`[devrelay] ========================================\n`);
  });
});
