import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { discoverCLIs } from '@/lib/agents/discover';

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clis = discoverCLIs();
  return NextResponse.json({
    clis,
    cachedAt: new Date().toISOString(),
    summary: {
      found: clis.filter((c) => c.found).length,
      total: clis.length,
    },
  });
}
