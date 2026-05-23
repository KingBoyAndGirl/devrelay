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
}
