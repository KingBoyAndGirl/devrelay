import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, workspaceMembers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
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

  // Check for duplicate slug
  const existing = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, slug),
  });
  if (existing) {
    return NextResponse.json({ error: '工作空间名称已被使用，请换一个名称' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const wsId = createId();

  try {
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
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE') || err?.message?.includes('FOREIGN')) {
      return NextResponse.json({ error: '创建失败，工作空间名称可能已存在或用户无效，请重新登录后重试' }, { status: 409 });
    }
    throw err;
  }
}
