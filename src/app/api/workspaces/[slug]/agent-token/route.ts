import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, workspaceMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { createId } from '@paralleldrive/cuid2';

interface AgentToken {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  lastSeenAt: string | null;
}

function getTokens(settings: Record<string, any>): AgentToken[] {
  // Migrate old single-token to array
  if (!settings.agentTokens && settings.agentToken) {
    settings.agentTokens = [{
      id: createId(),
      name: '默认令牌',
      token: settings.agentToken,
      createdAt: new Date().toISOString(),
      lastSeenAt: null,
    }];
    delete settings.agentToken;
  }
  return settings.agentTokens || [];
}

async function checkAdmin(ws: any, userId: string): Promise<boolean> {
  if (ws.createdBy === userId) return true;
  const membership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, ws.id),
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.role, 'admin')
    ),
  });
  return !!membership;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, params.slug),
  });
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const settings = ws.settings ? JSON.parse(ws.settings) : {};
  const tokens = getTokens(settings);

  // Auto-migrate if needed
  if (!ws.settings?.includes('agentTokens') && settings.agentTokens) {
    await db.update(workspaces)
      .set({ settings: JSON.stringify(settings), updatedAt: new Date().toISOString() })
      .where(eq(workspaces.id, ws.id));
  }

  // Reveal full token for a specific ID
  const revealId = req.nextUrl.searchParams.get('reveal');
  if (revealId) {
    const token = tokens.find((t: AgentToken) => t.id === revealId);
    if (!token) return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    return NextResponse.json({ id: token.id, name: token.name, token: token.token });
  }

  const now = Date.now();
  const ONLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

  return NextResponse.json({
    tokens: tokens.map((t: AgentToken) => ({
      id: t.id,
      name: t.name,
      tokenPreview: `${t.token.slice(0, 8)}...`,
      createdAt: t.createdAt,
      lastSeenAt: t.lastSeenAt,
      online: t.lastSeenAt ? (now - new Date(t.lastSeenAt).getTime()) < ONLINE_THRESHOLD_MS : false,
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).id;
  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, params.slug),
  });
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!(await checkAdmin(ws, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const settings = ws.settings ? JSON.parse(ws.settings) : {};
  const tokens: AgentToken[] = getTokens(settings);
  const name = body.name || `令牌 ${tokens.length + 1}`;

  const newToken: AgentToken = {
    id: createId(),
    name,
    token: randomBytes(32).toString('hex'),
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
  };

  tokens.push(newToken);
  settings.agentTokens = tokens;
  delete settings.agentToken; // remove legacy key

  await db.update(workspaces)
    .set({
      settings: JSON.stringify(settings),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workspaces.id, ws.id));

  return NextResponse.json({
    id: newToken.id,
    name: newToken.name,
    token: newToken.token, // full token, shown once
    createdAt: newToken.createdAt,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any).id;
  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, params.slug),
  });
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!(await checkAdmin(ws, userId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const tokenId = searchParams.get('id');
  if (!tokenId) return NextResponse.json({ error: 'Missing token id' }, { status: 400 });

  const settings = ws.settings ? JSON.parse(ws.settings) : {};
  const tokens: AgentToken[] = getTokens(settings);
  const filtered = tokens.filter((t: AgentToken) => t.id !== tokenId);

  if (filtered.length === tokens.length) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }

  settings.agentTokens = filtered;

  await db.update(workspaces)
    .set({
      settings: JSON.stringify(settings),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(workspaces.id, ws.id));

  return NextResponse.json({ ok: true });
}
