import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { workspaces, stages, issues, tasks, agents, activities } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { approveIssueStage } from '@/lib/workflow';
import { runAutoPR } from '@/lib/git/auto-pr';
import { createId } from '@paralleldrive/cuid2';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  if (!token) {
    return NextResponse.json({ error: 'Empty token' }, { status: 401 });
  }

  // Verify token
  const allWorkspaces = await db.query.workspaces.findMany();
  let validWs: typeof workspaces.$inferSelect | null = null;
  for (const ws of allWorkspaces) {
    try {
      const settings = ws.settings ? JSON.parse(ws.settings) : {};
      const tokens: any[] = settings.agentTokens || [];
      if (tokens.some((t: any) => t.token === token) || settings.agentToken === token) {
        validWs = ws;
        break;
      }
    } catch {}
  }

  if (!validWs) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const body = await req.json();
  const { stageId, agentId, exitCode, output, error: execError } = body;

  if (!stageId || !agentId) {
    return NextResponse.json({ error: 'stageId and agentId are required' }, { status: 400 });
  }

  const stage = await db.query.stages.findFirst({
    where: eq(stages.id, stageId),
  });

  if (!stage) {
    return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
  }

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
  });

  const now = new Date().toISOString();

  // Update stage status based on execution result
  if (exitCode === 0 && !execError) {
    await db
      .update(stages)
      .set({ status: 'completed', completedAt: now })
      .where(eq(stages.id, stageId));

    // Trigger next stage
    try { await approveIssueStage(stage.issueId, stage.step, agentId, agent?.name || 'Agent'); } catch {}

    // Run auto-PR if there's a linked task
    const linkedTask = await db.query.tasks.findFirst({
      where: and(eq(tasks.stageId, stageId), eq(tasks.agentId, agentId)),
    });

    if (linkedTask) {
      try {
        await runAutoPR({
          projectId: linkedTask.projectId,
          taskId: linkedTask.id,
          agentName: agent?.gitName || agent?.name || 'DevRelay Agent',
          agentEmail: agent?.gitEmail || undefined,
        });
      } catch {}
    }

    // Log activity
    try {
      await db.insert(activities).values({
        id: createId(),
        projectId: linkedTask?.projectId || '',
        actorId: agentId,
        actorName: agent?.name || 'Agent',
        action: 'agent_execution_completed',
        target: stageId,
        metadata: JSON.stringify({ exitCode, stageName: stage.name }),
        createdAt: now,
      });
    } catch {}
  } else {
    // Mark stage as failed
    await db
      .update(stages)
      .set({ status: 'failed', reviewNotes: execError || `Exit code: ${exitCode}`, completedAt: now })
      .where(eq(stages.id, stageId));

    // Log failure
    try {
      const linkedTask = await db.query.tasks.findFirst({
        where: and(eq(tasks.stageId, stageId), eq(tasks.agentId, agentId)),
      });
      await db.insert(activities).values({
        id: createId(),
        projectId: linkedTask?.projectId || '',
        actorId: agentId,
        actorName: agent?.name || 'Agent',
        action: 'agent_execution_failed',
        target: stageId,
        metadata: JSON.stringify({ exitCode, error: execError, stageName: stage.name }),
        createdAt: now,
      });
    } catch {}
  }

  return NextResponse.json({ ok: true, stageId, status: exitCode === 0 ? 'completed' : 'failed' });
}
