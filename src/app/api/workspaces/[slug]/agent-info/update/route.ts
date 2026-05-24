import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, params.slug),
  });
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const pkg = body.package;
  if (!pkg || typeof pkg !== 'string') {
    return NextResponse.json({ error: 'missing "package" field' }, { status: 400 });
  }

  // Forward to sidecar
  const port = process.env.DEVRELAY_AGENT_PORT || '4100';
  const settings = ws.settings ? JSON.parse(ws.settings) : {};
  const tokens = settings.agentTokens || [];
  const sidecarToken = tokens[0]?.token || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(sidecarToken ? { Authorization: `Bearer ${sidecarToken}` } : {}),
  };

  try {
    const res = await fetch(`http://localhost:${port}/update`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ package: pkg }),
      signal: AbortSignal.timeout(120000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: 'Sidecar not reachable — run `devrelay start` on your host machine' },
      { status: 502 }
    );
  }
}
