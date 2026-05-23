import { db } from '@/lib/db/client';
import { stages, agents, agentProjects, tasks } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { STAGE_DEFAULT_ROLES } from '@/types';

const MAX_AGENT_TASKS = 5;

export interface AssignResult {
  stageId: string;
  step: number;
  requiredRole: string;
  assignedTo: string | null;
  agentName: string | null;
  reason: string;
}

export async function autoAssignStage(
  projectId: string,
  step: number
): Promise<AssignResult> {
  const stage = await db.query.stages.findFirst({
    where: and(eq(stages.projectId, projectId), eq(stages.step, step)),
  });

  if (!stage) {
    return { stageId: '', step, requiredRole: '', assignedTo: null, agentName: null, reason: 'Stage not found' };
  }

  const requiredRole = stage.requiredRole || STAGE_DEFAULT_ROLES[step] || 'developer';

  // Find agents in this project with matching role
  const projectAgents = await db.query.agentProjects.findMany({
    where: eq(agentProjects.projectId, projectId),
  });

  if (projectAgents.length === 0) {
    return {
      stageId: stage.id,
      step,
      requiredRole,
      assignedTo: null,
      agentName: null,
      reason: `No agents assigned to project`,
    };
  }

  const agentIds = projectAgents.map((pa) => pa.agentId);

  const matchingAgents = await db.query.agents.findMany({
    where: and(
      eq(agents.enabled, true),
      eq(agents.role, requiredRole),
    ),
  });

  const projectMatching = matchingAgents.filter((a) => agentIds.includes(a.id));

  if (projectMatching.length === 0) {
    return {
      stageId: stage.id,
      step,
      requiredRole,
      assignedTo: null,
      agentName: null,
      reason: `No enabled agent with role "${requiredRole}" in project (${matchingAgents.length} matching agents exist outside project)`,
    };
  }

  // Check agent workload: count in_progress tasks per agent
  const best = await findBestAgent(projectMatching);

  if (!best) {
    return {
      stageId: stage.id,
      step,
      requiredRole,
      assignedTo: null,
      agentName: null,
      reason: `All ${projectMatching.length} matching agents are overloaded (>${MAX_AGENT_TASKS} active tasks)`,
    };
  }

  // Assign
  const now = new Date().toISOString();
  await db
    .update(stages)
    .set({ assignedTo: best.id, startedAt: stage.status === 'in_progress' ? stage.startedAt : now })
    .where(eq(stages.id, stage.id));

  return {
    stageId: stage.id,
    step,
    requiredRole,
    assignedTo: best.id,
    agentName: best.name,
    reason: `Assigned to ${best.name} (${best.activeTasks} active tasks)`,
  };
}

async function findBestAgent(
  agentList: Array<{ id: string; name: string }>
): Promise<{ id: string; name: string; activeTasks: number } | null> {
  let best: { id: string; name: string; activeTasks: number } | null = null;

  for (const agent of agentList) {
    const activeCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(and(eq(tasks.agentId, agent.id), eq(tasks.status, 'in_progress')))
      .then((rows) => Number(rows[0]?.count ?? 0));

    if (activeCount < MAX_AGENT_TASKS) {
      if (!best || activeCount < best.activeTasks) {
        best = { id: agent.id, name: agent.name, activeTasks: activeCount };
      }
    }
  }

  return best;
}

export async function autoAssignAllPending(projectId: string): Promise<AssignResult[]> {
  const allStages = await db.query.stages.findMany({
    where: eq(stages.projectId, projectId),
    orderBy: (stages, { asc }) => [asc(stages.step)],
  });

  const results: AssignResult[] = [];

  for (const stage of allStages) {
    if (!stage.assignedTo && (stage.status === 'pending' || stage.status === 'in_progress')) {
      const result = await autoAssignStage(projectId, stage.step);
      results.push(result);
    }
  }

  return results;
}

export async function autoAssignByRole(
  agentId: string,
  agentRole: string
): Promise<AssignResult[]> {
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, agentId),
  });

  if (!agent) return [];

  const projects = await db.query.agentProjects.findMany({
    where: eq(agentProjects.agentId, agentId),
  });

  const results: AssignResult[] = [];

  for (const ap of projects) {
    const pendingStages = await db.query.stages.findMany({
      where: and(
        eq(stages.projectId, ap.projectId),
        eq(stages.status, 'pending'),
      ),
      orderBy: (stages, { asc }) => [asc(stages.step)],
    });

    for (const stage of pendingStages) {
      const requiredRole = stage.requiredRole || STAGE_DEFAULT_ROLES[stage.step] || 'developer';
      if (requiredRole === agentRole && !stage.assignedTo) {
        const result = await autoAssignStage(ap.projectId, stage.step);
        results.push(result);
      }
    }
  }

  return results;
}
