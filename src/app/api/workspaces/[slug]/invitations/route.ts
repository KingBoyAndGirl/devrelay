import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, workspaceMembers, invitations } from '@/lib/db/schema';
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
  });

  if (!ws) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const list = await db.query.invitations.findMany({
    where: eq(invitations.workspaceId, ws.id),
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

  // Check permission: must be admin or creator
  const membership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, ws.id),
      eq(workspaceMembers.userId, userId),
    ),
  });

  if (!membership || (membership.role !== 'admin' && ws.createdBy !== userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { role = 'developer', expiresInDays = 7 } = await req.json();

  const code = createId().slice(0, 12);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * 86400000).toISOString();

  await db.insert(invitations).values({
    id: createId(),
    workspaceId: ws.id,
    code,
    createdBy: userId,
    role,
    expiresAt,
    createdAt: now.toISOString(),
  });

  const inviteUrl = `${req.nextUrl.origin}/invite/${code}`;

  return NextResponse.json({ code, role, expiresAt, inviteUrl }, { status: 201 });
}
