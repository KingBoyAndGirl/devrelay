import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, githubOAuthTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { getAuthorizationUrl, exchangeCodeForToken } from '@/lib/github';
import { config } from '@/lib/config';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', config.nextauthUrl));
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
      const { accessToken, refreshToken, expiresAt } = await exchangeCodeForToken(code);
      if (!accessToken) {
        return NextResponse.json({ error: 'Failed to get access token' }, { status: 400 });
      }

      // Store token temporarily for repo selection
      const tokenId = createId();
      await db.insert(githubOAuthTokens).values({
        id: tokenId,
        workspaceId: ws.id,
        accessToken,
        refreshToken: refreshToken || null,
        tokenExpiresAt: expiresAt || null,
        createdAt: new Date().toISOString(),
      });

      // Redirect to repo selection page
      const redirectUrl = new URL(`/workspaces/${wsSlug}/repos/select`, config.nextauthUrl);
      redirectUrl.searchParams.set('token_id', tokenId);
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
