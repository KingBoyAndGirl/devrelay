import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { agents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { buildSpawnConfig, runAgent } from '@/lib/agents/spawn';

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

  const { prompt } = await req.json();

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  const spawnConfig = buildSpawnConfig(agent);
  const child = runAgent(spawnConfig, prompt);

  // Collect output (non-streaming for simplicity; stream support via WebSocket later)
  const chunks: string[] = [];
  const errors: string[] = [];

  child.stdout?.on('data', (chunk: Buffer) => {
    chunks.push(chunk.toString());
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    errors.push(chunk.toString());
  });

  return new Promise<NextResponse>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill();
      resolve(NextResponse.json({
        output: chunks.join(''),
        errors: errors.join(''),
        timedOut: true,
      }));
    }, 300000); // 5 minute timeout

    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve(NextResponse.json({
        output: chunks.join(''),
        errors: errors.join(''),
        exitCode: code,
        timedOut: false,
      }));
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve(NextResponse.json({
        output: chunks.join(''),
        errors: errors.join('') + err.message,
        exitCode: -1,
        timedOut: false,
      }, { status: 500 }));
    });
  });
}
