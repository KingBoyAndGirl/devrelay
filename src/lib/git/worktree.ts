import { db } from '@/lib/db/client';
import { repositories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { simpleGit, SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || './data';
const REPOS_DIR = path.join(DATA_DIR, 'repos');

function getRepoDir(projectId: string): string {
  return path.join(REPOS_DIR, projectId);
}

function getGit(repoDir: string): SimpleGit {
  return simpleGit(repoDir);
}

export async function ensureWorktree(
  projectId: string,
  repoId: string
): Promise<{ workdir: string; branch: string; cloned: boolean }> {
  const repo = await db.query.repositories.findFirst({
    where: eq(repositories.id, repoId),
  });

  if (!repo) {
    throw new Error(`Repository ${repoId} not found`);
  }

  const workdir = getRepoDir(projectId);

  if (fs.existsSync(path.join(workdir, '.git'))) {
    // Already cloned — fetch and reset to default branch
    const git = getGit(workdir);
    await git.fetch('origin');
    const defaultBranch = repo.defaultBranch || 'main';
    await git.checkout(defaultBranch);
    await git.pull('origin', defaultBranch);
    return { workdir, branch: defaultBranch, cloned: false };
  }

  // Clone
  fs.mkdirSync(workdir, { recursive: true });

  if (!repo.accessToken) {
    throw new Error(`No access token for repository ${repoId}`);
  }

  const cloneUrl = repo.remoteUrl.replace(
    'https://',
    `https://x-access-token:${repo.accessToken}@`
  );

  const git = getGit(workdir);
  const defaultBranch = repo.defaultBranch || 'main';
  await git.clone(cloneUrl, '.', ['--branch', defaultBranch]);

  // Configure git user for this repo
  await git.addConfig('user.name', 'DevRelay Bot');
  await git.addConfig('user.email', 'bot@devrelay.local');

  return { workdir, branch: defaultBranch, cloned: true };
}

export function getRepoWorkdir(projectId: string): string {
  return getRepoDir(projectId);
}

export function repoExists(projectId: string): boolean {
  return fs.existsSync(path.join(getRepoDir(projectId), '.git'));
}
