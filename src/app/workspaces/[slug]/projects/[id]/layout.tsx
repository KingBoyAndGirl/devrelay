import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import Breadcrumb from '@/components/ui/Breadcrumb';
import ProjectNav from './nav';

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
      {/* Sticky project header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-2.5">
          <Breadcrumb items={[
            { label: '空间', href: `/workspaces/${params.slug}` },
            { label: '项目列表', href: `/workspaces/${params.slug}/projects` },
            { label: project.name },
          ]} />
        </div>
        <div className="px-6 py-2 flex items-center gap-4">
          <h2 className="font-bold text-lg">{project.name}</h2>
          {project.customer && (
            <span className="text-sm text-gray-400">客户: {project.customer}</span>
          )}
          <span className={
            project.status === 'completed' ? 'badge-success' :
            project.status === 'archived' ? 'badge-gray' :
            'badge-primary'
          }>
            {project.status === 'active' ? '进行中' :
             project.status === 'completed' ? '已完成' :
             project.status === 'archived' ? '已归档' : project.status}
          </span>
        </div>
        <ProjectNav slug={params.slug} id={params.id} />
      </header>
      {children}
    </div>
  );
}
