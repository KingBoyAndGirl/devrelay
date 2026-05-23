import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { agents, tasks, projects, stages, activities } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, params.id),
  });

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const include = req.nextUrl.searchParams.get('include');

  // Fetch tasks assigned to this agent
  let agentTasks: any[] = [];
  if (include === 'tasks' || !include) {
    agentTasks = await db.query.tasks.findMany({
      where: eq(tasks.agentId, agent.id),
      orderBy: [desc(tasks.updatedAt)],
      limit: 50,
    });

    // Enrich with project and stage names
    const projectIds = Array.from(new Set(agentTasks.map(t => t.projectId)));
    const projectMap: Record<string, string> = {};
    for (const pid of projectIds) {
      const p = await db.query.projects.findFirst({
        where: eq(projects.id, pid),
        columns: { id: true, name: true },
      });
      if (p) projectMap[p.id] = p.name;
    }

    const stageIds = Array.from(new Set(agentTasks.map(t => t.stageId).filter(Boolean)));
    const stageMap: Record<string, { step: number; name: string }> = {};
    for (const sid of stageIds) {
      const s = await db.query.stages.findFirst({
        where: eq(stages.id, sid!),
        columns: { id: true, step: true, name: true },
      });
      if (s) stageMap[s.id] = { step: s.step, name: s.name };
    }

    agentTasks = agentTasks.map(t => ({
      ...t,
      projectName: projectMap[t.projectId] || null,
      stageInfo: t.stageId ? stageMap[t.stageId] || null : null,
    }));
  }

  // Fetch recent activities for this agent
  let recentActivities: any[] = [];
  if (include === 'activities' || !include) {
    recentActivities = await db.query.activities.findMany({
      where: eq(activities.actorId, agent.id),
      orderBy: [desc(activities.createdAt)],
      limit: 20,
    });
  }

  return NextResponse.json({
    ...agent,
    tasks: agentTasks,
    recentActivities,
  });
}
