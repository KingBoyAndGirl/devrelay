import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

// Map CLI binary names to their npm packages
const CLI_NPM_MAP: Record<string, string> = {
  claude: '@anthropic-ai/claude-code',
  codex: '@openai/codex',
};

function extractVersion(raw: string): string | null {
  // Extract semver-ish string from version output like "2.1.150 (Claude Code)" or "codex-cli 0.132.0"
  const match = raw.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, { current: string; latest: string | null; npmPackage: string; hasUpdate: boolean }> = {};

  const checks = Object.entries(CLI_NPM_MAP).map(async ([bin, pkg]) => {
    try {
      const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        results[bin] = {
          current: '',
          latest: data.version || null,
          npmPackage: pkg,
          hasUpdate: false,
        };
      }
    } catch {}
  });

  await Promise.all(checks);

  return NextResponse.json(results);
}
