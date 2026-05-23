import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, repositories } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createOctokit, verifyToken } from '@/lib/github';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { slug: string; repoId: string } }
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

  const repo = await db.query.repositories.findFirst({
    where: and(
      eq(repositories.id, params.repoId),
      eq(repositories.workspaceId, ws.id)
    ),
  });

  if (!repo) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await db.delete(repositories).where(eq(repositories.id, repo.id));

  return NextResponse.json({ ok: true });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; repoId: string } }
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

  const repo = await db.query.repositories.findFirst({
    where: and(
      eq(repositories.id, params.repoId),
      eq(repositories.workspaceId, ws.id)
    ),
  });

  if (!repo || !repo.accessToken) {
    return NextResponse.json({ error: 'Not found or no token' }, { status: 404 });
  }

  // Test connection
  const octokit = createOctokit(repo.accessToken);
  const result = await verifyToken(octokit);

  return NextResponse.json({
    connected: result.valid,
    login: result.login,
    repo: repo.name,
  });
}
