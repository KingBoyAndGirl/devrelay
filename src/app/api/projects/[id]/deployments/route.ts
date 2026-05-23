import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { deployments, projects, stages, activities } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { createNotification } from '@/lib/notify';
import { approveStage } from '@/lib/workflow';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const list = await db.query.deployments.findMany({
    where: eq(deployments.projectId, params.id),
    orderBy: [desc(deployments.createdAt)],
  });

  return NextResponse.json(list);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { version, environment } = await req.json();

  // Find deployment stage (step 11)
  const deployStage = await db.query.stages.findFirst({
    where: and(eq(stages.projectId, params.id), eq(stages.step, 11)),
  });

  if (!deployStage) {
    return NextResponse.json({ error: 'Deployment stage not found' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const deployment = {
    id: createId(),
    projectId: params.id,
    stageId: deployStage.id,
    version: version || `deploy-${now.slice(0, 10)}`,
    environment: environment || 'production',
    status: 'deploying',
    createdAt: now,
  };

  await db.insert(deployments).values(deployment);

  // Log activity
  await db.insert(activities).values({
    id: createId(),
    projectId: params.id,
    actorId: (session.user as any).id || 'system',
    actorName: (session.user as any).username || 'User',
    action: 'deployment_started',
    target: deployment.id,
    metadata: JSON.stringify({ version: deployment.version, environment: deployment.environment }),
    createdAt: now,
  });

  // Set the deployment stage to in_progress
  if (deployStage.status === 'pending') {
    await db.update(stages)
      .set({ status: 'in_progress', startedAt: now })
      .where(eq(stages.id, deployStage.id));
  }

  return NextResponse.json(deployment, { status: 201 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { deploymentId, status, log } = await req.json();

  if (!deploymentId) {
    return NextResponse.json({ error: 'deploymentId is required' }, { status: 400 });
  }

  const dep = await db.query.deployments.findFirst({
    where: eq(deployments.id, deploymentId),
  });

  if (!dep) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {};

  if (status) updates.status = status;
  if (log !== undefined) updates.log = log;
  if (status === 'success' || status === 'failed') {
    updates.deployedAt = now;
  }

  await db.update(deployments)
    .set(updates)
    .where(eq(deployments.id, deploymentId));

  // Log activity for deployment completion/failure
  if (status === 'success' || status === 'failed') {
    await db.insert(activities).values({
      id: createId(),
      projectId: params.id,
      actorId: (session.user as any).id || 'system',
      actorName: (session.user as any).username || 'User',
      action: status === 'success' ? 'deployment_completed' : 'deployment_failed',
      target: deploymentId,
      metadata: JSON.stringify({ status, version: dep.version }),
      createdAt: now,
    });
  }

  // Auto-approve stage 11 on successful deploy
  if (status === 'success' && dep.stageId) {
    const stage = await db.query.stages.findFirst({
      where: eq(stages.id, dep.stageId),
    });
    if (stage && stage.status === 'in_progress') {
      await approveStage(params.id, 11);
    }
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
    with: { workspace: { with: { members: true } } },
  });

  if (project?.workspace?.members) {
    for (const member of project.workspace.members) {
      await createNotification({
        userId: member.userId,
        title: `部署${status === 'success' ? '成功' : status === 'failed' ? '失败' : '更新'}: ${dep.version}`,
        message: `${project.name} 部署${dep.version} ${status}`,
        type: 'comment',
        projectId: params.id,
        stageId: dep.stageId || undefined,
      });
    }
  }

  return NextResponse.json({ ...dep, ...updates });
}
