import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, projects, stages } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { STAGE_NAMES } from '@/types';

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

  const list = await db.query.projects.findMany({
    where: eq(projects.workspaceId, ws.id),
    orderBy: [desc(projects.updatedAt)],
    with: { stages: true },
  });

  return NextResponse.json(list);
}

export async function POST(
  req: NextRequest,
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

  const { name, description, customer } = await req.json();

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const projectId = createId();

  await db.insert(projects).values({
    id: projectId,
    workspaceId: ws.id,
    name: name.trim(),
    description: description || null,
    customer: customer || null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  // Auto-create all 13 stages; first stage starts in_progress
  const stageValues = Object.entries(STAGE_NAMES).map(([step, stageName]) => ({
    id: createId(),
    projectId,
    step: parseInt(step),
    name: stageName,
    status: (parseInt(step) === 1 ? 'in_progress' : 'pending') as 'pending' | 'in_progress',
    startedAt: parseInt(step) === 1 ? now : null,
  }));

  await db.insert(stages).values(stageValues);

  return NextResponse.json({ id: projectId, name: name.trim() }, { status: 201 });
}
