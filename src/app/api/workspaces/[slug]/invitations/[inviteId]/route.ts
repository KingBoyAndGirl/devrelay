import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, workspaceMembers, invitations } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { slug: string; inviteId: string } }
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

  const invite = await db.query.invitations.findFirst({
    where: eq(invitations.id, params.inviteId),
  });

  if (!invite || invite.workspaceId !== ws.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await db.delete(invitations).where(eq(invitations.id, params.inviteId));

  return NextResponse.json({ ok: true });
}
