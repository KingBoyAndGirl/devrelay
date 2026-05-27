import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { agents, workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
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
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  const agentList = await db.query.agents.findMany({
    where: eq(agents.workspaceId, ws.id),
    columns: {
      id: true,
      name: true,
      type: true,
      enabled: true,
    },
  });

  // Filter enabled agents
  const enabledAgents = agentList.filter(a => a.enabled);

  return NextResponse.json(enabledAgents);
}
