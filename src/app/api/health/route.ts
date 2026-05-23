import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export async function GET() {
  try {
    // Test DB connectivity
    await db.query.projects.findFirst();
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      message: (err as Error).message,
    }, { status: 503 });
  }
}
