import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, workspaceMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { slug: string; memberId: string } }
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

  // Check permission: must be admin or workspace creator
  const requesterMembership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, ws.id),
      eq(workspaceMembers.userId, userId),
    ),
  });

  if (!requesterMembership || (requesterMembership.role !== 'admin' && ws.createdBy !== userId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Prevent removing self
  const target = await db.query.workspaceMembers.findFirst({
    where: eq(workspaceMembers.id, params.memberId),
  });

  if (!target) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  if (target.userId === userId) {
    return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
  }

  await db.delete(workspaceMembers).where(eq(workspaceMembers.id, params.memberId));

  return NextResponse.json({ ok: true });
}
