import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, agents, tasks, projects } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, params.slug),
  });

  if (!ws) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const agentList = await db.query.agents.findMany({
    where: eq(agents.workspaceId, ws.id),
  });

  if (agentList.length === 0) {
    return NextResponse.json({ activeCount: 0, agents: [] });
  }

  const agentIds = agentList.map(a => a.id);

  const activeTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
      agentId: tasks.agentId,
      priority: tasks.priority,
      updatedAt: tasks.updatedAt,
      projectName: projects.name,
    })
    .from(tasks)
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        inArray(tasks.agentId, agentIds),
        eq(tasks.status, 'in_progress')
      )
    );

  const taskMap = new Map<string, typeof activeTasks[0]>();
  for (const t of activeTasks) {
    if (t.agentId) taskMap.set(t.agentId, t);
  }

  const result = agentList
    .map(agent => {
      const task = taskMap.get(agent.id) || null;
      return {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        role: agent.role,
        enabled: agent.enabled,
        currentTask: task
          ? {
              id: task.id,
              title: task.title,
              projectId: task.projectId,
              projectName: task.projectName,
              priority: task.priority,
              updatedAt: task.updatedAt,
            }
          : null,
      };
    })
    .sort((a, b) => {
      if (a.currentTask && !b.currentTask) return -1;
      if (!a.currentTask && b.currentTask) return 1;
      return 0;
    });

  const activeCount = result.filter(a => a.currentTask !== null).length;

  return NextResponse.json({ activeCount, agents: result });
}
