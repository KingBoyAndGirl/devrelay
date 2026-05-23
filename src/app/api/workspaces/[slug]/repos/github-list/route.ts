import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, repositories, githubOAuthTokens } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { createOctokit, listRepos } from '@/lib/github';

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
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const tokenId = new URL(req.url).searchParams.get('token_id');
  if (!tokenId) {
    return NextResponse.json({ error: 'Missing token_id' }, { status: 400 });
  }

  const tokenRecord = await db.query.githubOAuthTokens.findFirst({
    where: eq(githubOAuthTokens.id, tokenId),
  });

  if (!tokenRecord || tokenRecord.workspaceId !== ws.id) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 });
  }

  try {
    const octokit = createOctokit(tokenRecord.accessToken);
    const repos = await listRepos(octokit);

    // Check which repos already exist in this workspace
    const existingRepos = await db.query.repositories.findMany({
      where: eq(repositories.workspaceId, ws.id),
    });
    const existingUrls = new Set(existingRepos.map((r) => r.remoteUrl));

    const result = repos.map((repo) => ({
      fullName: repo.fullName,
      name: repo.name,
      cloneUrl: repo.cloneUrl,
      defaultBranch: repo.defaultBranch,
      private: repo.private,
      alreadyAdded: existingUrls.has(repo.cloneUrl),
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error('[github-list] Error:', err);
    return NextResponse.json({ error: 'Failed to list repos' }, { status: 500 });
  }
}
