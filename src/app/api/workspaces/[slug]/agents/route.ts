import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, agents } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, params.slug),
  });

  if (!ws) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const list = await db.query.agents.findMany({
    where: eq(agents.workspaceId, ws.id),
    orderBy: [desc(agents.createdAt)],
  });

  return NextResponse.json(list);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, params.slug),
  });

  if (!ws) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { type, name, execPath, argsTemplate, envVars } = await req.json();

  if (!type || !name) {
    return NextResponse.json({ error: 'type and name are required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const agentId = createId();

  await db.insert(agents).values({
    id: agentId,
    workspaceId: ws.id,
    createdBy: userId,
    type,
    name: name.trim(),
    execPath: execPath || null,
    argsTemplate: argsTemplate || null,
    envVars: envVars || null,
    enabled: true,
    createdAt: now,
  });

  return NextResponse.json({ id: agentId, name: name.trim(), type }, { status: 201 });
}
