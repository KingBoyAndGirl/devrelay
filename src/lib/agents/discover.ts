import { execSync } from 'child_process';
import { CLI_BINARIES } from './index';

export interface DiscoveredCLI {
  bin: string;
  found: boolean;
  path: string | null;
  version: string | null;
}

let cached: DiscoveredCLI[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export function discoverCLIs(): DiscoveredCLI[] {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  cached = CLI_BINARIES.map((bin) => {
    let path: string | null = null;
    let version: string | null = null;

    try {
      path = execSync(`which ${bin} 2>/dev/null`, { encoding: 'utf-8', timeout: 3000 }).trim();
      if (!path) throw new Error('not found');

      try {
        version = execSync(`${bin} --version 2>&1 || true`, { encoding: 'utf-8', timeout: 5000 })
          .trim()
          .split('\n')[0]
          .slice(0, 200);
      } catch {
        version = null;
      }
    } catch {
      path = null;
    }

    return { bin, found: !!path, path, version };
  });

  cachedAt = Date.now();
  return cached;
}

export function getDiscoveredCLI(bin: string): DiscoveredCLI | undefined {
  return discoverCLIs().find((c) => c.bin === bin);
}
