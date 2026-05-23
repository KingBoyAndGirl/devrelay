import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { workspaces, workspaceMembers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignOutButton } from '@/components/auth/SignOutButton';
import NotificationBell from '@/components/notifications/NotificationBell';

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const userId = (session.user as any).id;

  // Get workspaces this user is a member of
  const memberships = await db.query.workspaceMembers.findMany({
    where: eq(workspaceMembers.userId, userId),
    with: { workspace: true },
  });

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">DevRelay</h1>
        <div className="flex items-center gap-4">
          <NotificationBell />
          <span className="text-sm text-gray-600">{session.user?.name}</span>
          <SignOutButton />
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">我的空间</h2>
          <Link
            href="/workspaces/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            新建空间
          </Link>
        </div>

        {memberships.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg mb-2">还没有空间</p>
            <p className="text-sm mb-4">创建一个空间来开始管理你的交付项目</p>
            <Link href="/onboarding" className="text-blue-600 hover:underline text-sm">开始引导设置 →</Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {memberships.map((m) => (
              <Link
                key={m.workspace!.id}
                href={`/workspaces/${m.workspace!.slug}`}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{m.workspace!.name}</h3>
                    {m.workspace!.description && (
                      <p className="text-sm text-gray-500 mt-1">{m.workspace!.description}</p>
                    )}
                  </div>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                    {m.role}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
