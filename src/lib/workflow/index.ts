import { db } from '@/lib/db/client';
import { stages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function approveStage(projectId: string, step: number): Promise<void> {
  const now = new Date().toISOString();

  // Mark current stage as completed
  await db
    .update(stages)
    .set({ status: 'completed', completedAt: now })
    .where(and(eq(stages.projectId, projectId), eq(stages.step, step)));

  // If not the last step, set next stage to in_progress
  if (step < 13) {
    await db
      .update(stages)
      .set({ status: 'in_progress', startedAt: now })
      .where(and(eq(stages.projectId, projectId), eq(stages.step, step + 1)));
  }
}

export async function rejectStage(
  projectId: string,
  step: number,
  reviewNotes: string
): Promise<void> {
  const now = new Date().toISOString();

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
}

export function getProgress(stageList: Array<{ step: number; status: string }>): number {
  if (stageList.length === 0) return 0;
  const completed = stageList.filter(s => s.status === 'completed').length;
  return Math.round((completed / stageList.length) * 100);
}
