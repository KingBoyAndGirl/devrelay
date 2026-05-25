import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { SignOutButton } from '@/components/auth/SignOutButton';
import NotificationBell from '@/components/notifications/NotificationBell';
import AgentActivityPanel from '@/components/agents/AgentActivityPanel';
import { SidebarClient } from './sidebar-client';
import { GlobalSearch } from '@/components/ui/GlobalSearch';
import { SearchTrigger } from '@/components/ui/SearchTrigger';

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
      <SidebarClient
        slug={slug}
        workspaceName={ws.name}
        agentPanel={<AgentActivityPanel slug={slug} />}
        userInfo={
          <div className="flex items-center gap-2">
            <span className="truncate">{session.user?.name}</span>
            <SignOutButton />
          </div>
        }
      />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between h-12">
          <SearchTrigger />
          <NotificationBell />
        </header>
        {children}
      </div>

      <GlobalSearch slug={slug} />
    </div>
  );
}
