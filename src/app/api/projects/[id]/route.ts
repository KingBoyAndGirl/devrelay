import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { projects, stages, pullRequests, deployments, feedback } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

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
    with: {
      stages: true,
      projectRepos: { with: { repository: true } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Sort stages by step
  project.stages.sort((a, b) => a.step - b.step);

  // Fetch linked PRs for all stages
  const stageIds = project.stages.map(s => s.id);
  const linkedPRs = stageIds.length > 0
    ? await db.query.pullRequests.findMany({
        where: inArray(pullRequests.devrelayStageId, stageIds),
      })
    : [];

  // Attach PRs to their stages
  const prsByStage: Record<string, Array<typeof linkedPRs[0]>> = {};
  for (const pr of linkedPRs) {
    if (pr.devrelayStageId) {
      (prsByStage[pr.devrelayStageId] ||= []).push(pr);
    }
  }

  const stagesWithPRs = project.stages.map(s => ({
    ...s,
    linkedPRs: (prsByStage[s.id] || []).map(p => ({
      id: p.id,
      prNumber: p.prNumber,
      title: p.title,
      state: p.state || 'open',
      sourceBranch: p.sourceBranch,
      targetBranch: p.targetBranch,
    })),
  }));

  // Fetch latest deployment and recent feedback
  const [latestDeploy, feedbackItems] = await Promise.all([
    db.query.deployments.findFirst({
      where: eq(deployments.projectId, params.id),
      orderBy: (deployments, { desc }) => [desc(deployments.createdAt)],
    }),
    db.query.feedback.findMany({
      where: eq(feedback.projectId, params.id),
      orderBy: (feedback, { desc }) => [desc(feedback.createdAt)],
      limit: 5,
    }),
  ]);

  return NextResponse.json({
    ...project,
    stages: stagesWithPRs,
    latestDeployment: latestDeploy || null,
    recentFeedback: feedbackItems,
  });
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

  const { name, description, customer, status } = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (name) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (customer !== undefined) updates.customer = customer;
  if (status) updates.status = status;

  await db.update(projects).set(updates).where(eq(projects.id, params.id));

  return NextResponse.json({ ...project, ...updates });
}

export async function DELETE(
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

  await db.delete(projects).where(eq(projects.id, params.id));

  return NextResponse.json({ ok: true });
}
