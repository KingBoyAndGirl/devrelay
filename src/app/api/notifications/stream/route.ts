import { auth } from '@/lib/auth';
import { subscribe, unsubscribe } from '@/lib/notify';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = (session.user as any).id;
  const encoder = new TextEncoder();

  let closed = false;
  let controller: ReadableStreamDefaultController | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const callback = (event: any) => {
    if (!closed && controller) {
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      } catch { /* stream closed */ }
    }
  };

  subscribe(userId, callback);

  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl;

      heartbeat = setInterval(() => {
        if (!closed && controller) {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            closed = true;
            if (heartbeat) clearInterval(heartbeat);
          }
        }
      }, 30000);

      controller.enqueue(encoder.encode('event: connected\ndata: {}\n\n'));
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe(userId, callback);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
