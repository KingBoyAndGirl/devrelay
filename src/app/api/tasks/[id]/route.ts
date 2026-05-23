import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const VALID_STATUSES = ['todo', 'in_progress', 'in_review', 'done'];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, params.id),
  });

  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(task);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, params.id),
  });

  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { title, description, status, priority, assignedTo, stageId } = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (title) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (priority) updates.priority = priority;
  if (assignedTo !== undefined) updates.assignedTo = assignedTo;
  if (stageId !== undefined) updates.stageId = stageId;
  if (status && VALID_STATUSES.includes(status)) {
    updates.status = status;
  }

  await db.update(tasks).set(updates).where(eq(tasks.id, params.id));

  return NextResponse.json({ ...task, ...updates });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, params.id),
  });

  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await db.delete(tasks).where(eq(tasks.id, params.id));

  return NextResponse.json({ ok: true });
}
