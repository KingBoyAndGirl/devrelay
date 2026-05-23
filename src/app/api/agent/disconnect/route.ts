import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  if (!token) {
    return NextResponse.json({ error: 'Empty token' }, { status: 401 });
  }

  const allWorkspaces = await db.query.workspaces.findMany();
  for (const ws of allWorkspaces) {
    try {
      const settings = ws.settings ? JSON.parse(ws.settings) : {};
      const tokens: any[] = settings.agentTokens || [];

      const match = tokens.find((t: any) => t.token === token);
      const legacyMatch = !match && settings.agentToken === token;

      if (match || legacyMatch) {
        if (match) {
          match.lastSeenAt = null;
          await db.update(workspaces)
            .set({ settings: JSON.stringify(settings), updatedAt: new Date().toISOString() })
            .where(eq(workspaces.id, ws.id));

          // Broadcast offline status via Socket.IO
          try {
            const io = (globalThis as any).io;
            if (io) {
              io.emit('agent:status', {
                workspaceSlug: ws.slug,
                tokenId: match.id,
                online: false,
                lastSeenAt: null,
              });
            }
          } catch {}
        }
        return NextResponse.json({ ok: true });
      }
    } catch {
      // skip malformed settings
    }
  }

  return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
}
