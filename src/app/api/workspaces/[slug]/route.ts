import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import {
  workspaces, workspaceMembers, projects, agents, repositories,
  invitations, githubOAuthTokens, agentProjects, stages, tasks,
  documents, comments, activities, deployments, feedback, projectRepos,
  projectMembers, githubIssues, pullRequests, linkedCommits, notifications,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

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
    with: { members: { with: { user: true } }, repositories: true },
  });

  if (!ws) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(ws);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, params.slug),
  });

  if (!ws) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Only creator or admin can update
  const membership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, ws.id),
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.role, 'admin')
    ),
  });

  if (!membership && ws.createdBy !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, description } = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (name && typeof name === 'string' && name.trim().length > 0) {
    updates.name = name.trim();
    updates.slug = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || createId().slice(0, 8);
  }
  if (description !== undefined) {
    updates.description = description || null;
  }

  await db.update(workspaces)
    .set(updates)
    .where(eq(workspaces.id, ws.id));

  return NextResponse.json({ ...ws, ...updates });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, params.slug),
  });

  if (!ws) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (ws.createdBy !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Cascade delete: remove all related records before deleting workspace
  const wsProjects = await db.query.projects.findMany({
    where: eq(projects.workspaceId, ws.id),
    columns: { id: true },
  });
  const projectIds = wsProjects.map(p => p.id);

  const wsRepos = await db.query.repositories.findMany({
    where: eq(repositories.workspaceId, ws.id),
    columns: { id: true },
  });
  const repoIds = wsRepos.map(r => r.id);

  const wsAgents = await db.query.agents.findMany({
    where: eq(agents.workspaceId, ws.id),
    columns: { id: true },
  });
  const agentIds = wsAgents.map(a => a.id);

  // Delete project children
  for (const pid of projectIds) {
    await db.delete(stages).where(eq(stages.projectId, pid));
    await db.delete(tasks).where(eq(tasks.projectId, pid));
    await db.delete(documents).where(eq(documents.projectId, pid));
    await db.delete(comments).where(eq(comments.projectId, pid));
    await db.delete(activities).where(eq(activities.projectId, pid));
    await db.delete(deployments).where(eq(deployments.projectId, pid));
    await db.delete(feedback).where(eq(feedback.projectId, pid));
    await db.delete(projectRepos).where(eq(projectRepos.projectId, pid));
    await db.delete(projectMembers).where(eq(projectMembers.projectId, pid));
  }

  // Delete repo children
  for (const rid of repoIds) {
    await db.delete(githubIssues).where(eq(githubIssues.repositoryId, rid));
    await db.delete(pullRequests).where(eq(pullRequests.repositoryId, rid));
    await db.delete(linkedCommits).where(eq(linkedCommits.repositoryId, rid));
  }

  // Delete agent children
  for (const aid of agentIds) {
    await db.delete(agentProjects).where(eq(agentProjects.agentId, aid));
  }

  // Delete workspace-level records
  for (const pid of projectIds) {
    await db.delete(notifications).where(eq(notifications.projectId, pid));
  }
  if (ws.id) {
    await db.delete(activities).where(eq(activities.workspaceId, ws.id));
  }
  await db.delete(invitations).where(eq(invitations.workspaceId, ws.id));
  await db.delete(githubOAuthTokens).where(eq(githubOAuthTokens.workspaceId, ws.id));

  // Delete parent records
  await db.delete(projects).where(eq(projects.workspaceId, ws.id));
  await db.delete(repositories).where(eq(repositories.workspaceId, ws.id));
  await db.delete(agents).where(eq(agents.workspaceId, ws.id));
  await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, ws.id));

  // Finally delete workspace
  await db.delete(workspaces).where(eq(workspaces.id, ws.id));

  return NextResponse.json({ ok: true });
}
