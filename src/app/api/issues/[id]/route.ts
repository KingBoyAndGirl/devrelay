import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { issues, stages, agents } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const issue = await db.query.issues.findFirst({
    where: eq(issues.id, params.id),
    with: { stages: true },
  });

  if (!issue) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Sort stages by step
  const stageList = issue.stages ?? [];
  const sortedStages = [...stageList].sort((a: { step: number }, b: { step: number }) => a.step - b.step);

  // Resolve assigned agent names
  const assignedSet = new Set<string>();
  for (const s of sortedStages) { if (s.assignedTo) assignedSet.add(s.assignedTo); }
  const assignedIds = Array.from(assignedSet);
  const agentList = assignedIds.length > 0
    ? await db.query.agents.findMany({
        where: inArray(agents.id, assignedIds as string[]),
        columns: { id: true, name: true },
      })
    : [];
  const agentMap = new Map(agentList.map(a => [a.id, a]));

  const stagesWithInfo = sortedStages.map(s => ({
    ...s,
    assignedAgentName: s.assignedTo ? (agentMap.get(s.assignedTo)?.name || null) : null,
  }));

  // Progress
  const total = sortedStages.length;
  const done = sortedStages.filter(s => s.status === 'completed').length;
  const progress = total ? Math.round((done / total) * 100) : 0;

  return NextResponse.json({
    ...issue,
    stages: stagesWithInfo,
    progress,
    totalStages: total,
    doneStages: done,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const issue = await db.query.issues.findFirst({
    where: eq(issues.id, params.id),
  });
  if (!issue) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.type !== undefined) updates.type = body.type;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.status !== undefined) updates.status = body.status;
  if (body.assignedAgentId !== undefined) updates.assignedAgentId = body.assignedAgentId;

  await db.update(issues).set(updates).where(eq(issues.id, params.id));

  return NextResponse.json({ ...issue, ...updates });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const issue = await db.query.issues.findFirst({
    where: eq(issues.id, params.id),
  });
  if (!issue) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Delete all stages first
  await db.delete(stages).where(eq(stages.issueId, params.id));
  await db.delete(issues).where(eq(issues.id, params.id));

  return NextResponse.json({ ok: true });
}
