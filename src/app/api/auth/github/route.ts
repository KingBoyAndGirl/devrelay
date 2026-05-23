import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { repositories, workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { getAuthorizationUrl, exchangeCodeForToken, listRepos, createOctokit } from '@/lib/github';
import { config } from '@/lib/config';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const workspace = searchParams.get('workspace');

  const wsSlug = (workspace || state || '').trim();

  // Callback from GitHub OAuth
  if (code) {
    if (!wsSlug) {
      return NextResponse.json({ error: 'Missing workspace' }, { status: 400 });
    }

    const ws = await db.query.workspaces.findFirst({
      where: eq(workspaces.slug, wsSlug),
    });

    if (!ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    try {
      // Exchange code for token
      const { accessToken, refreshToken, expiresAt } = await exchangeCodeForToken(code);
      if (!accessToken) {
        return NextResponse.json({ error: 'Failed to get access token' }, { status: 400 });
      }

      const octokit = createOctokit(accessToken);
      const repos = await listRepos(octokit);
      const now = new Date().toISOString();

      let added = 0;
      for (const repo of repos) {
        // Check if already exists in this workspace
        const existing = await db.query.repositories.findFirst({
          where: eq(repositories.remoteUrl, repo.cloneUrl),
        });

        if (existing) continue;

        await db.insert(repositories).values({
          id: createId(),
          workspaceId: ws.id,
          name: repo.fullName,
          remoteUrl: repo.cloneUrl,
          accessToken,
          tokenExpiresAt: expiresAt || null,
          refreshToken: refreshToken || null,
          defaultBranch: repo.defaultBranch,
          createdAt: now,
          updatedAt: now,
        });
        added++;
      }

      // Redirect back to repos page
      const redirectUrl = new URL(`/workspaces/${wsSlug}/repos`, req.url);
      redirectUrl.searchParams.set('added', String(added));
      return NextResponse.redirect(redirectUrl);
    } catch (err) {
      console.error('[github-oauth] Error:', err);
      return NextResponse.json({ error: `GitHub auth failed: ${(err as Error).message}` }, { status: 500 });
    }
  }

  // Initiate OAuth flow
  if (!config.github.clientId) {
    return NextResponse.json({ error: 'GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env' }, { status: 400 });
  }

  if (!wsSlug) {
    return NextResponse.json({ error: 'Missing workspace parameter' }, { status: 400 });
  }

  const authUrl = getAuthorizationUrl(wsSlug);
  return NextResponse.redirect(authUrl);
}
