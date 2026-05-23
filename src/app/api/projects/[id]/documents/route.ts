import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { writeDoc, getProjectDocDir, docFileName } from '@/lib/docs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const list = await db.query.documents.findMany({
    where: eq(documents.projectId, params.id),
    orderBy: [desc(documents.updatedAt)],
  });

  return NextResponse.json(list);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const { title, type, content } = await req.json();

  if (!title || !type) {
    return NextResponse.json({ error: 'title and type are required' }, { status: 400 });
  }

  // Find latest version for this doc type
  const latest = await db.query.documents.findFirst({
    where: eq(documents.projectId, params.id),
    orderBy: [desc(documents.version)],
  });

  const version = (latest?.version ?? 0) + 1;
  const now = new Date().toISOString();
  const docId = createId();
  const fileName = `${type}-v${version}.md`;
  const filePath = `projects/${params.id}/docs/${fileName}`;

  // Write .md file
  await writeDoc(filePath, content || `# ${title}\n\n`);

  await db.insert(documents).values({
    id: docId,
    projectId: params.id,
    type,
    title,
    filePath,
    version,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ id: docId, title, type, version, filePath }, { status: 201 });
}
