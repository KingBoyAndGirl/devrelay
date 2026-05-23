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
  const currentPath = ''; // layout doesn't know pathname, children handle active state

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-gray-100">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 block mb-1">&larr; 空间列表</Link>
          <h1 className="font-bold text-lg truncate">{ws.name}</h1>
          <AgentActivityPanel slug={slug} />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavItem href={`/workspaces/${slug}`} label="概览" />
          <NavItem href={`/workspaces/${slug}/repos`} label="仓库" />
          <NavItem href={`/workspaces/${slug}/projects`} label="项目" />
          <NavItem href={`/workspaces/${slug}/agents`} label="Agent" />
          <NavItem href={`/workspaces/${slug}/notifications`} label="通知" badge={<NotificationNavBadge />} />
          <NavItem href={`/workspaces/${slug}/settings`} label="设置" />
        </nav>

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

function NavItem({ href, label, badge }: { href: string; label: string; badge?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
    >
      {label}
      {badge}
    </Link>
  );
}
