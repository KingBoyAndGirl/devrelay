import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './src/lib/config';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // Dynamic imports after Next.js is ready
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

  // Mount io for access in API routes
  (globalThis as any).io = io;

  server.listen(port, () => {
    console.log(`[devrelay] Server ready on http://${hostname}:${port}`);
    console.log(`[devrelay] Data directory: ${config.dataDir}`);
    console.log(`[devrelay] Admin user: ${config.adminUser}`);
  });
});
