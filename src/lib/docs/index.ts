import fs from 'fs/promises';
import path from 'path';
import { config } from '@/lib/config';

const DATA_DIR = config.dataDir;

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, 'docs'), { recursive: true });
}

export function getProjectDocDir(projectId: string): string {
  return path.join(DATA_DIR, 'projects', projectId, 'docs');
}

export function getProjectTaskDir(projectId: string, taskId: string): string {
  return path.join(DATA_DIR, 'projects', projectId, 'tasks', taskId);
}

export async function readDoc(filePath: string): Promise<string> {
  const fullPath = path.join(DATA_DIR, filePath);
  try {
    return await fs.readFile(fullPath, 'utf-8');
  } catch {
    return '';
  }
}

export async function writeDoc(filePath: string, content: string): Promise<void> {
  const fullPath = path.join(DATA_DIR, filePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}

export async function listDocs(dir: string): Promise<string[]> {
  const fullPath = path.join(DATA_DIR, dir);
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries.filter(e => e.isFile() && e.name.endsWith('.md')).map(e => e.name);
  } catch {
    return [];
  }
}

export function docFileName(step: number, type: string, version: number): string {
  return `${String(step).padStart(2, '0')}-${type}-v${version}.md`;
}
