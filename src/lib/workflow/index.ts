import { db } from '@/lib/db/client';
import { stages, activities } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { autoAssignStage } from './assign';
import { createId } from '@paralleldrive/cuid2';

export async function approveStage(projectId: string, step: number, actorId?: string, actorName?: string): Promise<void> {
  const now = new Date().toISOString();

  // Find the stage being approved
  const stage = await db.query.stages.findFirst({
    where: and(eq(stages.projectId, projectId), eq(stages.step, step)),
  });

  // Mark current stage as completed
  await db
    .update(stages)
    .set({ status: 'completed', completedAt: now })
    .where(and(eq(stages.projectId, projectId), eq(stages.step, step)));

  // If not the last step, set next stage to in_progress and auto-assign
  if (step < 13) {
    await db
      .update(stages)
      .set({ status: 'in_progress', startedAt: now })
      .where(and(eq(stages.projectId, projectId), eq(stages.step, step + 1)));

    // Auto-assign the next stage
    await autoAssignStage(projectId, step + 1);
  }

  // Log activity
  if (stage) {
    await db.insert(activities).values({
      id: createId(),
      projectId,
      actorId: actorId || 'system',
      actorName: actorName || 'System',
      action: 'stage_approved',
      target: stage.id,
      metadata: JSON.stringify({ step, stageName: stage.name }),
      createdAt: now,
    });
  }
}

export async function rejectStage(
  projectId: string,
  step: number,
  reviewNotes: string,
  actorId?: string,
  actorName?: string
): Promise<void> {
  const now = new Date().toISOString();

  // Find the stage being rejected
  const stage = await db.query.stages.findFirst({
    where: and(eq(stages.projectId, projectId), eq(stages.step, step)),
  });

  // Mark current stage as rejected
  await db
    .update(stages)
    .set({ status: 'rejected', reviewNotes, completedAt: now })
    .where(and(eq(stages.projectId, projectId), eq(stages.step, step)));

  // Go back to previous stage
  if (step > 1) {
    await db
      .update(stages)
      .set({ status: 'in_progress', startedAt: now, completedAt: null })
      .where(and(eq(stages.projectId, projectId), eq(stages.step, step - 1)));
  }

  // Log activity
  if (stage) {
    await db.insert(activities).values({
      id: createId(),
      projectId,
      actorId: actorId || 'system',
      actorName: actorName || 'System',
      action: 'stage_rejected',
      target: stage.id,
      metadata: JSON.stringify({ step, stageName: stage.name, reviewNotes }),
      createdAt: now,
    });
  }
}

export function getProgress(stageList: Array<{ step: number; status: string }>): number {
  if (stageList.length === 0) return 0;
  const completed = stageList.filter(s => s.status === 'completed').length;
  return Math.round((completed / stageList.length) * 100);
}
