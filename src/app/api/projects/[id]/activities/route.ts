import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { activities } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');

  const list = await db.query.activities.findMany({
    where: eq(activities.projectId, params.id),
    orderBy: [desc(activities.createdAt)],
    limit: Math.min(limit, 100),
  });

  return NextResponse.json(list);
}
