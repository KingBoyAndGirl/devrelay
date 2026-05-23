import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, workspaceMembers } from '@/lib/db/schema';
import { createId } from '@paralleldrive/cuid2';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const { name, description } = await req.json();

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  // Generate slug from name
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || createId().slice(0, 8);

  const now = new Date().toISOString();
  const wsId = createId();

  await db.insert(workspaces).values({
    id: wsId,
    name: name.trim(),
    slug,
    description: description || null,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  // Creator becomes admin member
  await db.insert(workspaceMembers).values({
    id: createId(),
    workspaceId: wsId,
    userId,
    role: 'admin',
    joinedAt: now,
  });

  return NextResponse.json({ id: wsId, slug, name: name.trim() }, { status: 201 });
}
