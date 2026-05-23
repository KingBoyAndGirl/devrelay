import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get('status');
  const where = status
    ? eq(tasks.projectId, params.id) // simplified; status filter applied below
    : undefined;

  let list = await db.query.tasks.findMany({
    where: eq(tasks.projectId, params.id),
    orderBy: [desc(tasks.updatedAt)],
  });

  if (status) {
    list = list.filter(t => t.status === status);
  }

  return NextResponse.json(list);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const { title, description, priority, stageId, repositoryId } = await req.json();

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const taskId = createId();

  await db.insert(tasks).values({
    id: taskId,
    projectId: params.id,
    title: title.trim(),
    description: description || null,
    status: 'todo',
    priority: priority || 'medium',
    stageId: stageId || null,
    repositoryId: repositoryId || null,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ id: taskId, title: title.trim() }, { status: 201 });
}
