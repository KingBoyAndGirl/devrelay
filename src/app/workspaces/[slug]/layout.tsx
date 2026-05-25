import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SignOutButton } from '@/components/auth/SignOutButton';
import NotificationBell from '@/components/notifications/NotificationBell';
import NotificationNavBadge from '@/components/notifications/NotificationNavBadge';
import AgentActivityPanel from '@/components/agents/AgentActivityPanel';
import { WorkspaceNav } from './nav-client';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user) return null;

  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, params.slug),
  });

  if (!ws) notFound();

  const slug = params.slug;

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-gray-100">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 block mb-1">&larr; 空间列表</Link>
          <h1 className="font-bold text-lg truncate">{ws.name}</h1>
          <AgentActivityPanel slug={slug} />
        </div>

        <WorkspaceNav slug={slug} />

        <div className="px-3 py-3 border-t border-gray-100 text-xs text-gray-400 space-y-1">
          <div className="flex items-center gap-2">
            <span className="truncate">{session.user?.name}</span>
            <SignOutButton />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-end h-12">
          <NotificationBell />
        </header>
        {children}
      </div>
    </div>
  );
}
