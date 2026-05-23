import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { invitations, workspaceMembers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

// Public: look up invitation by code (no auth required for GET)
export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  const invite = await db.query.invitations.findFirst({
    where: eq(invitations.code, params.code),
    with: { workspace: true },
  });

  if (!invite) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  }

  if (invite.usedBy) {
    return NextResponse.json({ error: 'Invitation already used' }, { status: 410 });
  }

  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return NextResponse.json({ error: 'Invitation expired' }, { status: 410 });
  }

  return NextResponse.json({
    code: invite.code,
    role: invite.role,
    workspaceName: invite.workspace?.name || null,
    expiresAt: invite.expiresAt,
  });
}

// Accept invitation (requires auth)
export async function POST(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).id;

  const invite = await db.query.invitations.findFirst({
    where: eq(invitations.code, params.code),
  });

  if (!invite) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  }

  if (invite.usedBy) {
    return NextResponse.json({ error: 'Invitation already used' }, { status: 410 });
  }

  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return NextResponse.json({ error: 'Invitation expired' }, { status: 410 });
  }

  // Check if already a member
  const existing = await db.query.workspaceMembers.findFirst({
    where: eq(workspaceMembers.id, `${invite.workspaceId}-${userId}`),
  });

  if (!existing) {
    await db.insert(workspaceMembers).values({
      id: createId(),
      workspaceId: invite.workspaceId,
      userId,
      role: invite.role,
      joinedAt: new Date().toISOString(),
    });
  }

  // Mark invitation as used
  await db.update(invitations)
    .set({ usedBy: userId })
    .where(eq(invitations.id, invite.id));

  return NextResponse.json({ ok: true, workspaceId: invite.workspaceId });
}
