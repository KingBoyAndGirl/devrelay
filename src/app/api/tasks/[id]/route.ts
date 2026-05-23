import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { tasks, stages, projectRepos, githubIssues } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createOctokit, createGitHubIssue } from '@/lib/github';
import { createId } from '@paralleldrive/cuid2';

const VALID_STATUSES = ['todo', 'in_progress', 'in_review', 'done'];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, params.id),
  });

  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(task);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, params.id),
  });

  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { title, description, status, priority, assignedTo, stageId, agentId, githubIssueId, createGitHubIssue } = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (title) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (priority) updates.priority = priority;
  if (assignedTo !== undefined) updates.assignedTo = assignedTo;
  if (stageId !== undefined) {
    updates.stageId = stageId;
    // Auto-sync agent from stage's assigned agent
    if (stageId) {
      const stage = await db.query.stages.findFirst({ where: eq(stages.id, stageId as string) });
      if (stage?.assignedTo) updates.agentId = stage.assignedTo;
      else updates.agentId = null;
    } else {
      updates.agentId = null;
    }
  }
  if (agentId !== undefined) updates.agentId = agentId;
  if (githubIssueId !== undefined) updates.githubIssueId = githubIssueId;

  // Create GitHub issue from task
  if (createGitHubIssue && !task.githubIssueId) {
    const projRepo = await db.query.projectRepos.findFirst({
      where: eq(projectRepos.projectId, task.projectId),
      with: { repository: true },
    });

    if (projRepo?.repository?.accessToken) {
      const repo = projRepo.repository;
      const repoToken = repo.accessToken!;
      const [owner, repoName] = repo.name.split('/');

      if (owner && repoName) {
        try {
          const octokit = createOctokit(repoToken);
          const { issueNumber, issueUrl } = await createGitHubIssue(
            octokit, owner, repoName,
            task.title,
            task.description || undefined,
            ['devrelay']
          );

          updates.githubIssueId = String(issueNumber);

          // Record in githubIssues sync table
          const now = new Date().toISOString();
          await db.insert(githubIssues).values({
            id: createId(),
            repositoryId: repo.id,
            issueNumber,
            title: task.title,
            body: task.description || null,
            state: 'open',
            devrelayTaskId: task.id,
            syncedAt: now,
            createdAt: now,
            updatedAt: now,
          });
        } catch (err) {
          console.error('[tasks] Failed to create GitHub issue:', err);
        }
      }
    }
  }

  if (status && VALID_STATUSES.includes(status)) {
    updates.status = status;
  }

  await db.update(tasks).set(updates).where(eq(tasks.id, params.id));

  return NextResponse.json({ ...task, ...updates });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, params.id),
  });

  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await db.delete(tasks).where(eq(tasks.id, params.id));

  return NextResponse.json({ ok: true });
}
