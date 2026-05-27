import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, testSpaces } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const TEST_SPACES_ROOT = join(process.env.HOME || '/tmp', '.devrelay', 'spaces');

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, params.slug),
  });

  if (!ws) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  // Find existing test space
  let testSpace = await db.query.testSpaces.findFirst({
    where: and(
      eq(testSpaces.workspaceId, ws.id),
      eq(testSpaces.name, 'default')
    ),
  });

  // Create if not exists
  if (!testSpace) {
    const spacePath = join(TEST_SPACES_ROOT, ws.id, 'test');

    // Create directory
    if (!existsSync(spacePath)) {
      await mkdir(spacePath, { recursive: true });
    }

    const now = new Date().toISOString();
    const id = createId();

    await db.insert(testSpaces).values({
      id,
      workspaceId: ws.id,
      name: 'default',
      path: spacePath,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    testSpace = {
      id,
      workspaceId: ws.id,
      name: 'default',
      path: spacePath,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
  }

  return NextResponse.json({
    id: testSpace.id,
    name: testSpace.name,
    path: testSpace.path,
    status: testSpace.status,
  });
}
