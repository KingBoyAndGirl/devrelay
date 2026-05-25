import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { projects, issues, deployments, feedback } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

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
      projectRepos: { with: { repository: true } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Get issues with their stages
  const issueList = await db.query.issues.findMany({
    where: eq(issues.projectId, params.id),
    with: { stages: true },
    orderBy: [desc(issues.updatedAt)],
  });

  // Compute progress across all issues
  let totalStages = 0;
  let completedStages = 0;
  for (const issue of issueList) {
    const stagesOf = issue.stages || [];
    totalStages += stagesOf.length;
    completedStages += stagesOf.filter(s => s.status === 'completed').length;
  }

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
    issueCount: issueList.length,
    issues: issueList,
    progress: totalStages ? Math.round((completedStages / totalStages) * 100) : 0,
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
