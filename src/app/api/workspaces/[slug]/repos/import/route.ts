import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, repositories, githubOAuthTokens } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { createOctokit, getRepo } from '@/lib/github';

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

  const { tokenId, repoFullNames } = await req.json();

  if (!tokenId || !repoFullNames || !Array.isArray(repoFullNames) || repoFullNames.length === 0) {
    return NextResponse.json({ error: 'tokenId and repoFullNames are required' }, { status: 400 });
  }

  const tokenRecord = await db.query.githubOAuthTokens.findFirst({
    where: eq(githubOAuthTokens.id, tokenId),
  });

  if (!tokenRecord || tokenRecord.workspaceId !== ws.id) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 });
  }

  const octokit = createOctokit(tokenRecord.accessToken);
  const now = new Date().toISOString();

  let added = 0;
  for (const fullName of repoFullNames) {
    const [owner, repoName] = fullName.split('/');
    if (!owner || !repoName) continue;

    try {
      const repoData = await getRepo(octokit, owner, repoName);

      const existing = await db.query.repositories.findFirst({
        where: and(
          eq(repositories.workspaceId, ws.id),
          eq(repositories.remoteUrl, repoData.clone_url),
        ),
      });
      if (existing) continue;

      await db.insert(repositories).values({
        id: createId(),
        workspaceId: ws.id,
        name: repoData.full_name,
        provider: 'github',
        remoteUrl: repoData.clone_url,
        accessToken: tokenRecord.accessToken,
        tokenExpiresAt: tokenRecord.tokenExpiresAt,
        refreshToken: tokenRecord.refreshToken,
        defaultBranch: repoData.default_branch || 'main',
        createdAt: now,
        updatedAt: now,
      });
      added++;
    } catch {
      // Skip repos we can't access
      continue;
    }
  }

  // Clean up the temporary token
  await db.delete(githubOAuthTokens).where(eq(githubOAuthTokens.id, tokenId));

  return NextResponse.json({ added });
}
