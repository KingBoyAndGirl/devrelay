import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, workspaceMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
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
    with: { members: true, repositories: true },
  });

  if (!ws) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(ws);
}

export async function PUT(
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

  // Only creator or admin can update
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

  const { name, description } = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (name && typeof name === 'string' && name.trim().length > 0) {
    updates.name = name.trim();
    updates.slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || createId().slice(0, 8);
  }
  if (description !== undefined) {
    updates.description = description || null;
  }

  await db.update(workspaces)
    .set(updates)
    .where(eq(workspaces.id, ws.id));

  return NextResponse.json({ ...ws, ...updates });
}

export async function DELETE(
  _req: NextRequest,
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

  if (ws.createdBy !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.delete(workspaces).where(eq(workspaces.id, ws.id));

  return NextResponse.json({ ok: true });
}
