import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  if (!token) {
    return NextResponse.json({ error: 'Empty token' }, { status: 401 });
  }

  const agentVersion = req.headers.get('x-agent-version') || null;

  const allWorkspaces = await db.query.workspaces.findMany();
  for (const ws of allWorkspaces) {
    try {
      const settings = ws.settings ? JSON.parse(ws.settings) : {};
      const tokens: any[] = settings.agentTokens || [];

      // Check multi-token array
      const match = tokens.find((t: any) => t.token === token);
      // Also check legacy single token
      const legacyMatch = !match && settings.agentToken === token;

      if (match || legacyMatch) {
        // Update lastSeenAt and agent metadata
        if (match) {
          match.lastSeenAt = new Date().toISOString();
          if (agentVersion) match.agentVersion = agentVersion;
          await db.update(workspaces)
            .set({ settings: JSON.stringify(settings), updatedAt: new Date().toISOString() })
            .where(eq(workspaces.id, ws.id));

          // Broadcast online status via Socket.IO
          try {
            const io = (globalThis as any).io;
            if (io) {
              io.emit('agent:status', {
                workspaceSlug: ws.slug,
                tokenId: match.id,
                online: true,
                lastSeenAt: match.lastSeenAt,
              });
            }
          } catch {}
        }

        return NextResponse.json({
          valid: true,
          workspace: {
            id: ws.id,
            name: ws.name,
            slug: ws.slug,
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch {
      // skip malformed settings
    }
  }

  return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
}
