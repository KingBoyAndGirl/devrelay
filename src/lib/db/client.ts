import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import * as relations from './relations';

const DATABASE_PATH = process.env.DATABASE_PATH || './data/devrelay.db';

const client = createClient({ url: `file:${DATABASE_PATH}` });
export const db = drizzle(client, { schema: { ...schema, ...relations } });

export async function initializeDatabase() {
  // Enable WAL mode for concurrent reads
  await client.execute('PRAGMA journal_mode=WAL');
  await client.execute('PRAGMA foreign_keys=ON');

  // Run migrations for new columns (idempotent)
  const migrations = [
    `ALTER TABLE agents ADD COLUMN role TEXT NOT NULL DEFAULT 'developer'`,
    `ALTER TABLE agents ADD COLUMN git_name TEXT`,
    `ALTER TABLE agents ADD COLUMN git_email TEXT`,
    `ALTER TABLE stages ADD COLUMN required_role TEXT`,
    `ALTER TABLE workspaces ADD COLUMN settings TEXT`,
  ];

  for (const sql of migrations) {
    try { await client.execute(sql); } catch { /* column already exists */ }
  }
}
