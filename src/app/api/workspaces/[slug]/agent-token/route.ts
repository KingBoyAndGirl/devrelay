import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, workspaceMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { randomBytes } from 'crypto';

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, params.slug),
  });
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const settings = ws.settings ? JSON.parse(ws.settings) : {};
  const token = settings.agentToken || null;

  return NextResponse.json({
    hasToken: !!token,
    token: token ? `${token.slice(0, 8)}${'*'.repeat(24)}` : null,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).id;
  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, params.slug),
  });
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only admin can generate token
  const membership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, ws.id),
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.role, 'admin')
    ),
  });
  if (!membership && ws.createdBy !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const token = randomBytes(32).toString('hex');
  const settings = ws.settings ? JSON.parse(ws.settings) : {};
  settings.agentToken = token;

  await db.update(workspaces)
    .set({
      settings: JSON.stringify(settings),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workspaces.id, ws.id));

  return NextResponse.json({ token });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).id;
  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, params.slug),
  });
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const membership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, ws.id),
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.role, 'admin')
    ),
  });
  if (!membership && ws.createdBy !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const settings = ws.settings ? JSON.parse(ws.settings) : {};
  delete settings.agentToken;

  await db.update(workspaces)
    .set({
      settings: JSON.stringify(settings),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workspaces.id, ws.id));

  return NextResponse.json({ ok: true });
}
