import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { autoAssignStage, autoAssignAllPending } from '@/lib/workflow/assign';

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
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const { step } = await req.json().catch(() => ({}));

  if (typeof step === 'number') {
    const result = await autoAssignStage(params.id, step);
    return NextResponse.json(result);
  }

  const results = await autoAssignAllPending(params.id);
  return NextResponse.json(results);
}
