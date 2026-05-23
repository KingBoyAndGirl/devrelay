import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function WorkspacePage({ params }: { params: { slug: string } }) {
  const session = await auth();
  if (!session?.user) return null;

  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, params.slug),
  });

  if (!ws) notFound();

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-gray-500 hover:text-gray-700">&larr; 空间列表</Link>
          <h1 className="text-xl font-bold">{ws.name}</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Link
            href={`/workspaces/${ws.slug}/repos`}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold">仓库</h3>
            <p className="text-sm text-gray-500 mt-1">管理 GitHub 仓库连接</p>
          </Link>
          <Link
            href={`/workspaces/${ws.slug}/projects`}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold">项目</h3>
            <p className="text-sm text-gray-500 mt-1">管理交付项目和流程</p>
          </Link>
          <Link
            href={`/workspaces/${ws.slug}/agents`}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold">Agent</h3>
            <p className="text-sm text-gray-500 mt-1">管理 AI 智能体</p>
          </Link>
          <Link
            href={`/workspaces/${ws.slug}/settings`}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold">设置</h3>
            <p className="text-sm text-gray-500 mt-1">空间设置与成员管理</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
