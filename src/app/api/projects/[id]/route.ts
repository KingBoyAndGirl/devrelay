import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { projects, stages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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

  return NextResponse.json(project);
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
