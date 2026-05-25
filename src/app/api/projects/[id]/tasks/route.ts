import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { tasks, stages, issues } from '@/lib/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
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
  const agentId = req.nextUrl.searchParams.get('agentId');

  const list = await db.query.tasks.findMany({
    where: eq(tasks.projectId, params.id),
    orderBy: [desc(tasks.updatedAt)],
  });

  // Fetch stages for stage info enrichment (through issues)
  const projectIssues = await db.query.issues.findMany({
    where: eq(issues.projectId, params.id),
    columns: { id: true },
  });
  const issueIds = projectIssues.map(i => i.id);
  const projectStages = issueIds.length > 0
    ? await db.query.stages.findMany({
        where: inArray(stages.issueId, issueIds),
      })
    : [];
  const stageMap = new Map(projectStages.map(s => [s.id, { id: s.id, step: s.step, name: s.name, status: s.status }]));

  const enriched = list.map(t => ({
    ...t,
    stageInfo: t.stageId ? stageMap.get(t.stageId) || null : null,
  }));

  let filtered = enriched;
  if (status) {
    filtered = filtered.filter(t => t.status === status);
  }
  if (agentId) {
    filtered = filtered.filter(t => t.agentId === agentId);
  }

  return NextResponse.json(filtered);
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

  // Auto-assign agent from stage if stageId is provided
  let agentId: string | null = null;
  if (stageId) {
    const stage = await db.query.stages.findFirst({
      where: eq(stages.id, stageId),
    });
    if (stage?.assignedTo) {
      agentId = stage.assignedTo;
    }
  }

  await db.insert(tasks).values({
    id: taskId,
    projectId: params.id,
    title: title.trim(),
    description: description || null,
    status: 'todo',
    priority: priority || 'medium',
    stageId: stageId || null,
    repositoryId: repositoryId || null,
    agentId,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ id: taskId, title: title.trim(), agentId }, { status: 201 });
}
