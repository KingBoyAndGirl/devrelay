import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { projects, agents, agentProjects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
  });

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Get all agents in this workspace
  const workspaceAgents = await db.query.agents.findMany({
    where: eq(agents.workspaceId, project.workspaceId),
  });

  // Get current project assignments
  const assignments = await db.query.agentProjects.findMany({
    where: eq(agentProjects.projectId, params.id),
  });

  const assignedIds = new Set(assignments.map(a => a.agentId));

  return NextResponse.json(
    workspaceAgents.map(a => ({
      ...a,
      assigned: assignedIds.has(a.id),
    }))
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
  });

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { agentIds } = await req.json();

  if (!Array.isArray(agentIds)) {
    return NextResponse.json({ error: 'agentIds must be an array' }, { status: 400 });
  }

  // Remove existing assignments for this project
  await db.delete(agentProjects).where(eq(agentProjects.projectId, params.id));

  // Insert new assignments
  if (agentIds.length > 0) {
    const now = new Date().toISOString();
    await db.insert(agentProjects).values(
      agentIds.map(agentId => ({
        id: createId(),
        projectId: params.id,
        agentId,
      }))
    );
  }

  const updated = await db.query.agentProjects.findMany({
    where: eq(agentProjects.projectId, params.id),
  });

  return NextResponse.json(updated);
}
