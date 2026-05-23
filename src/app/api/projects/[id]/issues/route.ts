import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { projects, projectRepos, repositories, githubIssues, tasks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { createOctokit, listIssues } from '@/lib/github';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const issues = await db.query.githubIssues.findMany({
    where: eq(githubIssues.devrelayTaskId, params.id),
    orderBy: (githubIssues, { desc }) => [desc(githubIssues.updatedAt)],
  });

  return NextResponse.json(issues);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
    with: {
      projectRepos: { with: { repository: true } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const repos = project.projectRepos.map(pr => pr.repository).filter(r => r.accessToken);
  if (repos.length === 0) {
    return NextResponse.json({ error: 'No connected repositories with access tokens' }, { status: 400 });
  }

  const results: Array<{ issueNumber: number; title: string; taskId?: string }> = [];
  const now = new Date().toISOString();

  for (const repo of repos) {
    const octokit = createOctokit(repo.accessToken!);
    const [owner, repoName] = repo.name.split('/');

    if (!owner || !repoName) continue;

    try {
      const issues = await listIssues(octokit, owner, repoName, { state: 'open' });

      for (const issue of issues) {
        // Skip pull requests (GitHub API returns PRs as issues too)
        if ((issue as any).pull_request) continue;

        // Check if already synced
        const existing = await db.query.githubIssues.findFirst({
          where: eq(githubIssues.id, `${repo.id}-${issue.number}`),
        });

        if (existing) {
          results.push({ issueNumber: issue.number, title: issue.title, taskId: existing.devrelayTaskId || undefined });
          continue;
        }

        // Store the GitHub issue
        const issueId = createId();
        await db.insert(githubIssues).values({
          id: issueId,
          repositoryId: repo.id,
          issueNumber: issue.number,
          title: issue.title,
          body: issue.body || null,
          state: issue.state || 'open',
          labels: JSON.stringify(issue.labels),
          assignees: JSON.stringify(issue.assignees),
          syncedAt: now,
          createdAt: issue.created_at || now,
          updatedAt: issue.updated_at || now,
        });

        // Create a linked DevRelay task
        const taskId = createId();
        await db.insert(tasks).values({
          id: taskId,
          projectId: params.id,
          title: `[GitHub #${issue.number}] ${issue.title}`,
          description: issue.body || null,
          status: 'todo',
          priority: 'medium',
          repositoryId: repo.id,
          githubIssueId: issueId,
          createdAt: now,
          updatedAt: now,
        });

        // Link issue back to task
        await db.update(githubIssues)
          .set({ devrelayTaskId: taskId })
          .where(eq(githubIssues.id, issueId));

        results.push({ issueNumber: issue.number, title: issue.title, taskId });
      }
    } catch (err) {
      results.push({ issueNumber: 0, title: `Error syncing ${repo.name}: ${(err as Error).message}` });
    }
  }

  return NextResponse.json({ synced: results.length, results });
}
