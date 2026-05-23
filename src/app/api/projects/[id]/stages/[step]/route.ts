import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { stages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { projects } from '@/lib/db/schema';
import { approveStage, rejectStage } from '@/lib/workflow';
import { notifyStageTransition } from '@/lib/notify';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; step: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const step = parseInt(params.step);
  if (isNaN(step) || step < 1 || step > 13) {
    return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
  }

  const stage = await db.query.stages.findFirst({
    where: and(eq(stages.projectId, params.id), eq(stages.step, step)),
  });

  if (!stage) {
    return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
  });

  const { action, reviewNotes } = await req.json();

  if (action === 'approve') {
    if (stage.status !== 'in_progress') {
      return NextResponse.json({ error: '只能通过进行中的阶段' }, { status: 400 });
    }
    await approveStage(params.id, step);
    if (project) {
      await notifyStageTransition({
        projectId: params.id,
        projectName: project.name,
        stageStep: step,
        stageName: stage.name,
        action: 'approved',
      });
    }
  } else if (action === 'reject') {
    if (stage.status !== 'in_progress') {
      return NextResponse.json({ error: '只能驳回进行中的阶段' }, { status: 400 });
    }
    await rejectStage(params.id, step, reviewNotes || '');
    if (project) {
      await notifyStageTransition({
        projectId: params.id,
        projectName: project.name,
        stageStep: step,
        stageName: stage.name,
        action: 'rejected',
        reviewNotes: reviewNotes || '',
      });
    }
  } else {
    return NextResponse.json({ error: 'Invalid action. Use "approve" or "reject"' }, { status: 400 });
  }

  const updatedStages = await db.query.stages.findMany({
    where: eq(stages.projectId, params.id),
    orderBy: (stages, { asc }) => [asc(stages.step)],
  });

  return NextResponse.json(updatedStages);
}
