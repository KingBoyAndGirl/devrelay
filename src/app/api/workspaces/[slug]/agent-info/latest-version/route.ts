import { NextRequest, NextResponse } from 'next/server';

const NPM_PACKAGE = 'devrelay-agent';

export async function GET(_req: NextRequest) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'npm registry unavailable' }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json({
      latestVersion: data.version,
      packageName: NPM_PACKAGE,
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch latest version' }, { status: 502 });
  }
}
