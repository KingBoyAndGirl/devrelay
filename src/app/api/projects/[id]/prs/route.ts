import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { projects, projectRepos, repositories, pullRequests, stages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { createOctokit } from '@/lib/github';

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
    with: { projectRepos: { with: { repository: true } } },
  });

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Get all PRs for all repos in this project
  const repoIds = project.projectRepos.map(pr => pr.repositoryId);
  let allPRs: any[] = [];
  for (const rid of repoIds) {
    const prs = await db.query.pullRequests.findMany({
      where: eq(pullRequests.repositoryId, rid),
      orderBy: (pullRequests, { desc }) => [desc(pullRequests.updatedAt)],
    });
    allPRs = allPRs.concat(prs);
  }

  return NextResponse.json(allPRs);
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
    with: { projectRepos: { with: { repository: true } } },
  });

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { repositoryId, title, head, base } = await req.json();

  if (!repositoryId || !title || !head || !base) {
    return NextResponse.json({ error: 'repositoryId, title, head, and base are required' }, { status: 400 });
  }

  const repo = await db.query.repositories.findFirst({
    where: eq(repositories.id, repositoryId),
  });

  if (!repo || !repo.accessToken) {
    return NextResponse.json({ error: 'Repository not found or no access token' }, { status: 400 });
  }

  const [owner, repoName] = repo.name.split('/');
  if (!owner || !repoName) {
    return NextResponse.json({ error: 'Invalid repository name format' }, { status: 400 });
  }

  try {
    const octokit = createOctokit(repo.accessToken);
    const { data: pr } = await octokit.rest.pulls.create({
      owner,
      repo: repoName,
      title,
      head,
      base,
    });

    const now = new Date().toISOString();

    // Find code review stage (step 8) to link the PR
    const reviewStage = await db.query.stages.findFirst({
      where: and(eq(stages.projectId, params.id), eq(stages.step, 8)),
    });

    const prId = createId();

    await db.insert(pullRequests).values({
      id: prId,
      repositoryId: repo.id,
      prNumber: pr.number,
      title: pr.title,
      body: pr.body || null,
      state: 'open',
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      commitSha: pr.head.sha,
      devrelayStageId: reviewStage?.id || null,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    });

    // Set code review stage to in_progress when a PR is created
    if (reviewStage && reviewStage.status === 'pending') {
      await db.update(stages)
        .set({ status: 'in_progress', startedAt: now })
        .where(eq(stages.id, reviewStage.id));
    }

    return NextResponse.json({
      id: prId,
      prNumber: pr.number,
      url: pr.html_url,
      devrelayStageId: reviewStage?.id || null,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: `Failed to create PR: ${(err as Error).message}` }, { status: 500 });
  }
}
