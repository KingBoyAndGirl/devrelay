import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, repositories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { createOctokit, verifyToken, getRepo } from '@/lib/github';

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

  const repos = await db.query.repositories.findMany({
    where: eq(repositories.workspaceId, ws.id),
    orderBy: (repositories, { desc }) => [desc(repositories.updatedAt)],
  });

  return NextResponse.json(repos);
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

  const { owner, repo: repoName, accessToken } = await req.json();

  if (!owner || !repoName) {
    return NextResponse.json({ error: 'owner and repo are required' }, { status: 400 });
  }

  const token = accessToken || '';
  const octokit = createOctokit(token);

  // Verify repo exists and token has access
  let repoData;
  try {
    repoData = await getRepo(octokit, owner, repoName);
  } catch {
    return NextResponse.json({ error: '无法访问仓库，请检查仓库名称和 Token' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const repoId = createId();

  await db.insert(repositories).values({
    id: repoId,
    workspaceId: ws.id,
    name: repoData.full_name || `${owner}/${repoName}`,
    provider: 'github',
    remoteUrl: repoData.clone_url || `https://github.com/${owner}/${repoName}.git`,
    accessToken: token || null,
    defaultBranch: repoData.default_branch || 'main',
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ id: repoId, name: repoData.full_name }, { status: 201 });
}
