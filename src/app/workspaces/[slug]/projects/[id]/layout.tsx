import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string; id: string };
}) {
  const session = await auth();
  if (!session?.user) return null;

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, params.id),
  });

  if (!project) notFound();

  return (
    <div>
      {/* Project header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-4">
          <Link
            href={`/workspaces/${params.slug}/projects`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; 项目列表
          </Link>
          <h2 className="font-bold text-lg">{project.name}</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            project.status === 'completed' ? 'bg-green-100 text-green-700' :
            project.status === 'archived' ? 'bg-gray-100 text-gray-500' :
            'bg-blue-100 text-blue-700'
          }`}>
            {project.status === 'active' ? '进行中' :
             project.status === 'completed' ? '已完成' :
             project.status === 'archived' ? '已归档' : project.status}
          </span>
        </div>
        {/* Project sub-nav */}
        <nav className="flex gap-1 mt-3">
          <SubNav href={`/workspaces/${params.slug}/projects/${params.id}`} label="流程看板" />
          <SubNav href={`/workspaces/${params.slug}/projects/${params.id}/documents`} label="文档" />
          <SubNav href={`/workspaces/${params.slug}/projects/${params.id}/tasks`} label="任务" />
          <SubNav href={`/workspaces/${params.slug}/projects/${params.id}/prs`} label="Pull Requests" />
        </nav>
      </header>
      {children}
    </div>
  );
}

function SubNav({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
    >
      {label}
    </Link>
  );
}
