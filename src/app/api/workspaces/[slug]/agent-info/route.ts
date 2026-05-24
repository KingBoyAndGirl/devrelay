import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface AgentTokenRecord {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  lastSeenAt: string | null;
  agentVersion?: string;
}

interface DiscoveredCli {
  bin: string;
  version: string | null;
}

interface TokenInfo {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: string | null;
  agentVersion: string | null;
  detectedClis: string[];
  cliDetails: DiscoveredCli[];
  activeCount: number;
  maxConcurrent: number;
  queueLength: number;
  sidecarReachable: boolean;
}

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

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
  if (!ws) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const settings = ws.settings ? JSON.parse(ws.settings) : {};
  const tokens: AgentTokenRecord[] = settings.agentTokens || [];

  // Try to reach the embedded sidecar for live info
  let sidecarHealth: { activeCount: number; maxConcurrent: number; queueLength: number } | null = null;
  let sidecarClis: string[] = [];
  let cliDetails: DiscoveredCli[] = [];
  try {
    const port = process.env.DEVRELAY_AGENT_PORT || '4100';
    // Use any available agent token for sidecar auth
    const sidecarToken = tokens[0]?.token || '';
    const headers: Record<string, string> = sidecarToken
      ? { Authorization: `Bearer ${sidecarToken}` }
      : {};
    const [healthRes, discoverRes] = await Promise.all([
      fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(2000) }),
      fetch(`http://localhost:${port}/discover`, { headers, signal: AbortSignal.timeout(2000) }),
    ]);
    if (healthRes.ok) sidecarHealth = await healthRes.json();
    if (discoverRes.ok) {
      const data: any = await discoverRes.json();
      const found = (data.clis || []).filter((c: any) => c.found);
      sidecarClis = found.map((c: any) => c.bin);
      cliDetails = found.map((c: any) => ({ bin: c.bin, version: c.version || null }));
    }
  } catch {
    // sidecar not reachable — that's fine
  }

  const now = Date.now();

  const tokenInfos: TokenInfo[] = tokens.map((t) => {
    const online = t.lastSeenAt
      ? (now - new Date(t.lastSeenAt).getTime()) < ONLINE_THRESHOLD_MS
      : false;

    return {
      id: t.id,
      name: t.name,
      online,
      lastSeenAt: t.lastSeenAt,
      agentVersion: t.agentVersion || null,
      detectedClis: online ? sidecarClis : [],
      cliDetails: online ? cliDetails : [],
      activeCount: online ? (sidecarHealth?.activeCount ?? 0) : 0,
      maxConcurrent: online ? (sidecarHealth?.maxConcurrent ?? 0) : 0,
      queueLength: online ? (sidecarHealth?.queueLength ?? 0) : 0,
      sidecarReachable: online ? !!sidecarHealth : false,
    };
  });

  return NextResponse.json({ tokens: tokenInfos });
}
