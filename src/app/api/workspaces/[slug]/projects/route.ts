import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, projects, tasks } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { getTemplate } from '@/lib/templates';

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
    with: { issues: { with: { stages: true } } },
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

  const { name, description, customer, template } = await req.json();

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

  // Stages are now created at the Issue level, not Project level.
  // No default stages are created here.

  // Bulk-insert template tasks if a template was selected
  // Note: stageId is left null since stages are now at the Issue level
  if (template && template !== 'empty') {
    const tmpl = getTemplate(template);
    if (tmpl) {
      const taskValues = tmpl.tasks.map((t) => ({
        id: createId(),
        projectId,
        title: t.title,
        description: t.description || null,
        status: 'todo',
        priority: t.priority,
        stageId: null,
        createdAt: now,
        updatedAt: now,
      }));

      if (taskValues.length > 0) {
        await db.insert(tasks).values(taskValues);
      }
    }
  }

  return NextResponse.json({ id: projectId, name: name.trim(), templateTasks: getTemplate(template)?.tasks.length || 0 }, { status: 201 });
}
