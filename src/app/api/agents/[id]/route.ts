import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { agents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, params.id),
  });

  if (!agent) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(agent);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, params.id),
  });

  if (!agent) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Only creator can edit
  if (agent.createdBy !== userId) {
    return NextResponse.json({ error: 'Forbidden: only creator can edit' }, { status: 403 });
  }

  const { name, role, execPath, argsTemplate, envVars, enabled, gitName, gitEmail } = await req.json();
  const updates: Record<string, unknown> = {};

  if (name) updates.name = name;
  if (role) updates.role = role;
  if (execPath !== undefined) updates.execPath = execPath;
  if (argsTemplate !== undefined) updates.argsTemplate = argsTemplate;
  if (envVars !== undefined) updates.envVars = envVars;
  if (enabled !== undefined) updates.enabled = enabled;
  if (gitName !== undefined) updates.gitName = gitName;
  if (gitEmail !== undefined) updates.gitEmail = gitEmail;

  await db.update(agents).set(updates).where(eq(agents.id, params.id));

  return NextResponse.json({ ...agent, ...updates });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, params.id),
  });

  if (!agent) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Only creator can delete
  if (agent.createdBy !== userId) {
    return NextResponse.json({ error: 'Forbidden: only creator can delete' }, { status: 403 });
  }

  await db.delete(agents).where(eq(agents.id, params.id));

  return NextResponse.json({ ok: true });
}
