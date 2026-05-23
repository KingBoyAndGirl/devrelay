import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { feedback, projects, stages } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { createNotification } from '@/lib/notify';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const status = searchParams.get('status');

  let list;
  if (type) {
    list = await db.query.feedback.findMany({
      where: and(eq(feedback.projectId, params.id), eq(feedback.type, type)),
      orderBy: [desc(feedback.createdAt)],
    });
  } else if (status) {
    list = await db.query.feedback.findMany({
      where: and(eq(feedback.projectId, params.id), eq(feedback.status, status)),
      orderBy: [desc(feedback.createdAt)],
    });
  } else {
    list = await db.query.feedback.findMany({
      where: eq(feedback.projectId, params.id),
      orderBy: [desc(feedback.createdAt)],
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

  const { type, title, description, severity } = await req.json();

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  // Find monitoring stage (step 13) if feedback related
  const monitorStage = await db.query.stages.findFirst({
    where: and(eq(stages.projectId, params.id), eq(stages.step, 13)),
  });

  const now = new Date().toISOString();
  const item = {
    id: createId(),
    projectId: params.id,
    stageId: monitorStage?.id || null,
    type: type || 'feedback',
    title: title.trim(),
    description: description || null,
    severity: severity || 'medium',
    status: 'open',
    reportedBy: (session.user as any).id || session.user.email || 'unknown',
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(feedback).values(item);

  // Set monitoring stage to in_progress if pending
  if (monitorStage && monitorStage.status === 'pending') {
    await db.update(stages)
      .set({ status: 'in_progress', startedAt: now })
      .where(eq(stages.id, monitorStage.id));
  }

  // Notify project members
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
    with: { workspace: { with: { members: true } } },
  });

  if (project?.workspace?.members) {
    for (const member of project.workspace.members) {
      await createNotification({
        userId: member.userId,
        title: `${type === 'bug' ? 'Bug' : type === 'incident' ? '事故' : '反馈'}: ${title}`,
        message: `[${severity}] ${title}`,
        type: 'comment',
        projectId: params.id,
        stageId: monitorStage?.id || undefined,
      });
    }
  }

  return NextResponse.json(item, { status: 201 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { feedbackId, status, assignedTo, description } = await req.json();

  if (!feedbackId) {
    return NextResponse.json({ error: 'feedbackId is required' }, { status: 400 });
  }

  const item = await db.query.feedback.findFirst({
    where: eq(feedback.id, feedbackId),
  });

  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (status) updates.status = status;
  if (assignedTo !== undefined) updates.assignedTo = assignedTo;
  if (description !== undefined) updates.description = description;

  await db.update(feedback).set(updates).where(eq(feedback.id, feedbackId));

  return NextResponse.json({ ...item, ...updates });
}
