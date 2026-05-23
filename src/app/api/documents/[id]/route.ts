import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { readDoc, writeDoc } from '@/lib/docs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, params.id),
  });

  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const content = await readDoc(doc.filePath);
  return NextResponse.json({ ...doc, content });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, params.id),
  });

  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { title, content } = await req.json();
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (title) updates.title = title;

  // Write new content to .md file
  if (content !== undefined) {
    await writeDoc(doc.filePath, content);
  }

  await db.update(documents).set(updates).where(eq(documents.id, params.id));

  return NextResponse.json({ ...doc, ...updates });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, params.id),
  });

  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await db.delete(documents).where(eq(documents.id, params.id));

  return NextResponse.json({ ok: true });
}
