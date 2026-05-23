import { NextResponse } from 'next/server';
import { getTemplateList } from '@/lib/templates';

export async function GET() {
  return NextResponse.json(getTemplateList());
}
