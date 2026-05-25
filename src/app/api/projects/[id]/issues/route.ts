import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { projects, issues, stages, agents, agentProjects } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
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
  const statusFilter = searchParams.get('status');

  let list;
  if (statusFilter) {
    list = await db.query.issues.findMany({
      where: and(eq(issues.projectId, params.id), eq(issues.status, statusFilter)),
      orderBy: [desc(issues.updatedAt)],
      with: { stages: true },
    });
  } else {
    list = await db.query.issues.findMany({
      where: eq(issues.projectId, params.id),
      orderBy: [desc(issues.updatedAt)],
      with: { stages: true },
    });
  }

  // Resolve agent names
  const agentIdSet = new Set<string>();
  for (const i of list) { if (i.assignedAgentId) agentIdSet.add(i.assignedAgentId); }
  const agentIds = Array.from(agentIdSet);
  const agentList = agentIds.length > 0
    ? await db.query.agents.findMany({ where: (agents, { inArray }) => inArray(agents.id, agentIds as string[]) })
    : [];
  const agentMap = new Map(agentList.map(a => [a.id, a]));

  const enriched = list.map(issue => ({
    ...issue,
    stages: [...(issue.stages ?? [])].sort((a: { step: number }, b: { step: number }) => a.step - b.step),
    assignedAgentName: issue.assignedAgentId ? agentMap.get(issue.assignedAgentId)?.name || null : null,
  }));

  return NextResponse.json(enriched);
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

  const { title, description, type, priority, stageNames, assignedAgentId } = await req.json();

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  if (!Array.isArray(stageNames) || stageNames.length === 0) {
    return NextResponse.json({ error: 'At least one stage is required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const issueId = createId();

  await db.insert(issues).values({
    id: issueId,
    projectId: params.id,
    type: type || 'feature',
    title: title.trim(),
    description: description || null,
    priority: priority || 'medium',
    status: 'backlog',
    assignedAgentId: assignedAgentId || null,
    reportedBy: (session.user as any).id || 'unknown',
    createdAt: now,
    updatedAt: now,
  });

  // Create stages for this issue
  const stageValues = stageNames.map((name, idx) => ({
    id: createId(),
    issueId,
    step: idx + 1,
    name,
    status: idx === 0 ? ('in_progress' as const) : ('pending' as const),
    startedAt: idx === 0 ? now : null,
  }));

  await db.insert(stages).values(stageValues);

  // Auto-assign first stage if agent is assigned
  if (assignedAgentId) {
    const firstStage = stageValues[0];
    await db.update(stages)
      .set({ assignedTo: assignedAgentId })
      .where(eq(stages.id, firstStage.id));
  }

  return NextResponse.json({ id: issueId, title: title.trim(), stageCount: stageNames.length }, { status: 201 });
}
