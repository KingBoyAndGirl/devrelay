import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { comments, projects } from '@/lib/db/schema';
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

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
  });

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const stageId = searchParams.get('stageId');
  const taskId = searchParams.get('taskId');

  let list;
  if (stageId) {
    list = await db.query.comments.findMany({
      where: eq(comments.stageId, stageId),
      orderBy: [desc(comments.createdAt)],
    });
  } else if (taskId) {
    list = await db.query.comments.findMany({
      where: eq(comments.taskId, taskId),
      orderBy: [desc(comments.createdAt)],
    });
  } else {
    list = await db.query.comments.findMany({
      where: eq(comments.projectId, params.id),
      orderBy: [desc(comments.createdAt)],
    });
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

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
  });

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { content, stageId, taskId } = await req.json();

  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const comment = {
    id: createId(),
    projectId: params.id,
    userId: (session.user as any).id || session.user.email || 'unknown',
    userName: session.user.name || session.user.email || 'unknown',
    content: content.trim(),
    stageId: stageId || null,
    taskId: taskId || null,
    createdAt: now,
  };

  await db.insert(comments).values(comment);

  // Broadcast comment to all clients viewing this project
  try {
    const io = (globalThis as any).io;
    if (io) {
      io.to(`project:${params.id}`).emit('comment', comment);
    }
  } catch {}

  return NextResponse.json(comment, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const commentId = searchParams.get('commentId');
  if (!commentId) {
    return NextResponse.json({ error: 'commentId is required' }, { status: 400 });
  }

  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, commentId),
  });

  if (!comment) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (comment.projectId !== params.id) {
    return NextResponse.json({ error: 'Comment does not belong to this project' }, { status: 400 });
  }

  await db.delete(comments).where(eq(comments.id, commentId));

  return NextResponse.json({ ok: true });
}
