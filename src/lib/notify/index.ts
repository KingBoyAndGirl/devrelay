import { db } from '@/lib/db/client';
import { notifications, workspaceMembers, projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import type { Server as SocketIOServer } from 'socket.io';

function getIO(): SocketIOServer | undefined {
  return (globalThis as any).io;
}

export async function createNotification(opts: {
  userId: string;
  title: string;
  message: string;
  type: string;
  projectId?: string;
  stageId?: string;
  taskId?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const nid = createId();

  await db.insert(notifications).values({
    id: nid,
    userId: opts.userId,
    title: opts.title,
    message: opts.message,
    type: opts.type,
    projectId: opts.projectId || null,
    stageId: opts.stageId || null,
    taskId: opts.taskId || null,
    isRead: false,
    createdAt: now,
  });

  // Push via WebSocket
  const io = getIO();
  if (io) {
    io.to(`user:${opts.userId}`).emit('notification', {
      id: nid,
      title: opts.title,
      message: opts.message,
      type: opts.type,
      projectId: opts.projectId,
      stageId: opts.stageId,
      taskId: opts.taskId,
    });
  }
}

export async function notifyStageTransition(opts: {
  projectId: string;
  projectName: string;
  stageStep: number;
  stageName: string;
  action: 'approved' | 'rejected';
  reviewNotes?: string;
}): Promise<void> {
  // Find workspace members to notify
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, opts.projectId),
    with: { workspace: { with: { members: true } } },
  });

  if (!project?.workspace) return;

  const title = opts.action === 'approved'
    ? `阶段通过: ${opts.stageName}`
    : `阶段驳回: ${opts.stageName}`;

  const message = opts.action === 'approved'
    ? `${opts.projectName} 的「${opts.stageName}」已通过，进入下一阶段`
    : `${opts.projectName} 的「${opts.stageName}」被驳回: ${opts.reviewNotes || ''}`;

  for (const member of project.workspace.members) {
    await createNotification({
      userId: member.userId,
      title,
      message,
      type: opts.action === 'approved' ? 'stage_approved' : 'stage_rejected',
      projectId: opts.projectId,
      stageId: undefined,
    });
  }
}

export async function notifyTaskAssigned(opts: {
  taskId: string;
  taskTitle: string;
  projectId: string;
  userId: string;
}): Promise<void> {
  await createNotification({
    userId: opts.userId,
    title: '任务分配',
    message: `你被分配了任务: ${opts.taskTitle}`,
    type: 'task_assigned',
    projectId: opts.projectId,
    taskId: opts.taskId,
  });
}
