import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, agents, projects, agentProjects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string; id: string } }
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

  // Get all projects in workspace
  const workspaceProjects = await db.query.projects.findMany({
    where: eq(projects.workspaceId, ws.id),
  });

  // Get current agent-project assignments
  const assignments = await db.query.agentProjects.findMany({
    where: eq(agentProjects.agentId, params.id),
  });

  const assignedIds = new Set(assignments.map(a => a.projectId));

  return NextResponse.json(
    workspaceProjects.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      assigned: assignedIds.has(p.id),
    }))
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { slug: string; id: string } }
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

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, params.id),
  });

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const { projectIds } = await req.json();

  if (!Array.isArray(projectIds)) {
    return NextResponse.json({ error: 'projectIds must be an array' }, { status: 400 });
  }

  // Remove existing assignments for this agent
  await db.delete(agentProjects).where(eq(agentProjects.agentId, params.id));

  // Insert new assignments
  if (projectIds.length > 0) {
    await db.insert(agentProjects).values(
      projectIds.map(projectId => ({
        id: createId(),
        projectId,
        agentId: params.id,
      }))
    );
  }

  const updated = await db.query.agentProjects.findMany({
    where: eq(agentProjects.agentId, params.id),
  });

  return NextResponse.json(updated);
}
