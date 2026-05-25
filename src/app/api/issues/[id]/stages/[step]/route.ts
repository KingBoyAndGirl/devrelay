import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { issues, stages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { approveIssueStage, rejectIssueStage } from '@/lib/workflow';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; step: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const step = parseInt(params.step);
  if (isNaN(step) || step < 1) {
    return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
  }

  const stage = await db.query.stages.findFirst({
    where: and(eq(stages.issueId, params.id), eq(stages.step, step)),
  });

  if (!stage) {
    return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
  }

  const issue = await db.query.issues.findFirst({
    where: eq(issues.id, params.id),
  });

  const { action, reviewNotes, requiredRole } = await req.json();

  // Update requiredRole without status change
  if (requiredRole && !action) {
    await db
      .update(stages)
      .set({ requiredRole })
      .where(and(eq(stages.issueId, params.id), eq(stages.step, step)));

    const updatedStages = await db.query.stages.findMany({
      where: eq(stages.issueId, params.id),
      orderBy: (stages, { asc }) => [asc(stages.step)],
    });
    return NextResponse.json(updatedStages);
  }

  if (action === 'approve') {
    if (stage.status !== 'in_progress') {
      return NextResponse.json({ error: '只能通过进行中的阶段' }, { status: 400 });
    }
    await approveIssueStage(params.id, step);

    // Update issue status to in_progress if it was backlog
    if (issue && issue.status === 'backlog') {
      await db.update(issues)
        .set({ status: 'in_progress', updatedAt: new Date().toISOString() })
        .where(eq(issues.id, params.id));
    }
  } else if (action === 'reject') {
    if (stage.status !== 'in_progress') {
      return NextResponse.json({ error: '只能驳回进行中的阶段' }, { status: 400 });
    }
    await rejectIssueStage(params.id, step, reviewNotes || '');
  } else {
    return NextResponse.json({ error: 'Invalid action. Use "approve" or "reject"' }, { status: 400 });
  }

  const updatedStages = await db.query.stages.findMany({
    where: eq(stages.issueId, params.id),
    orderBy: (stages, { asc }) => [asc(stages.step)],
  });

  // Broadcast stage update
  try {
    const io = (globalThis as any).io;
    if (io) {
      io.to(`project:${issue?.projectId}`).emit('stage_update', {
        issueId: params.id,
        step,
        stageName: stage.name,
        status: action === 'approve' ? 'completed' : 'rejected',
        reviewNotes: reviewNotes || '',
        action,
        userId: (session.user as any).id,
        userName: session.user.name,
      });
    }
  } catch {}

  return NextResponse.json(updatedStages);
}
