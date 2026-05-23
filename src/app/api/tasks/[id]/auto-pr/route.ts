import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { runAutoPR } from '@/lib/git/auto-pr';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, params.id),
  });

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  if (!task.projectId) {
    return NextResponse.json({ error: 'Task has no project' }, { status: 400 });
  }

  const { agentName, agentEmail } = await req.json().catch(() => ({}));

  const result = await runAutoPR({
    projectId: task.projectId,
    taskId: task.id,
    agentName: agentName || 'DevRelay Agent',
    agentEmail: agentEmail || undefined,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error, ...result }, { status: 500 });
  }

  return NextResponse.json(result);
}
