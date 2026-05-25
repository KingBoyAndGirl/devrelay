import { db } from '@/lib/db/client';
import { stages, issues, activities } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { autoAssignStage } from './assign';
import { createId } from '@paralleldrive/cuid2';

export function getProgress(stageList: Array<{ step: number; status: string }>): number {
  if (stageList.length === 0) return 0;
  const completed = stageList.filter(s => s.status === 'completed').length;
  return Math.round((completed / stageList.length) * 100);
}

// ── Issue-level workflow ──────────────────────────────

export async function approveIssueStage(issueId: string, step: number, actorId?: string, actorName?: string): Promise<void> {
  const now = new Date().toISOString();

  const stage = await db.query.stages.findFirst({
    where: and(eq(stages.issueId, issueId), eq(stages.step, step)),
  });

  // Mark current stage as completed
  await db
    .update(stages)
    .set({ status: 'completed', completedAt: now })
    .where(and(eq(stages.issueId, issueId), eq(stages.step, step)));

  // Get the issue to find projectId and total steps
  const issue = await db.query.issues.findFirst({
    where: eq(issues.id, issueId),
  });
  const allStages = await db.query.stages.findMany({
    where: eq(stages.issueId, issueId),
  });
  const maxStep = Math.max(...allStages.map(s => s.step));

  // If not the last step, set next stage to in_progress and auto-assign
  if (step < maxStep) {
    await db
      .update(stages)
      .set({ status: 'in_progress', startedAt: now })
      .where(and(eq(stages.issueId, issueId), eq(stages.step, step + 1)));

    try { await autoAssignStage(issueId, step + 1); } catch {}
  } else {
    // All stages done, mark issue as done
    if (issue) {
      await db.update(issues)
        .set({ status: 'done', updatedAt: now })
        .where(eq(issues.id, issueId));
    }
  }

  // Log activity
  if (stage && issue) {
    await db.insert(activities).values({
      id: createId(),
      projectId: issue.projectId,
      actorId: actorId || 'system',
      actorName: actorName || 'System',
      action: 'stage_approved',
      target: stage.id,
      metadata: JSON.stringify({ step, stageName: stage.name, issueId }),
      createdAt: now,
    });
  }
}

export async function rejectIssueStage(
  issueId: string,
  step: number,
  reviewNotes: string,
  actorId?: string,
  actorName?: string
): Promise<void> {
  const now = new Date().toISOString();

  const stage = await db.query.stages.findFirst({
    where: and(eq(stages.issueId, issueId), eq(stages.step, step)),
  });

  // Mark current stage as rejected
  await db
    .update(stages)
    .set({ status: 'rejected', reviewNotes, completedAt: now })
    .where(and(eq(stages.issueId, issueId), eq(stages.step, step)));

  // Go back to previous stage
  if (step > 1) {
    await db
      .update(stages)
      .set({ status: 'in_progress', startedAt: now, completedAt: null })
      .where(and(eq(stages.issueId, issueId), eq(stages.step, step - 1)));
  }

  // Log activity
  const issue = await db.query.issues.findFirst({
    where: eq(issues.id, issueId),
  });
  if (stage && issue) {
    await db.insert(activities).values({
      id: createId(),
      projectId: issue.projectId,
      actorId: actorId || 'system',
      actorName: actorName || 'System',
      action: 'stage_rejected',
      target: stage.id,
      metadata: JSON.stringify({ step, stageName: stage.name, reviewNotes, issueId }),
      createdAt: now,
    });
  }
}

// Legacy wrappers — re-export issue-level as the canonical API
export { approveIssueStage as approveStage, rejectIssueStage as rejectStage };
