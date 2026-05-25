'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ListSkeleton } from '@/components/ui/SkeletonLoader';
import { FolderGit2, Search } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string | null;
  customer: string | null;
  status: string;
  stages: Array<{ step: number; status: string }>;
  createdAt: string;
}

export default function ProjectsPage({ params: _params }: { params: { slug: string } }) {
  const router = useRouter();
  const routeParams = useParams();
  const slug = routeParams.slug as string;

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`/api/workspaces/${slug}/projects`)
      .then(r => r.json())
      .then(data => { setProjects(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  function progress(stages: Project['stages']) {
    const done = stages.filter(s => s.status === 'completed').length;
    return stages.length ? Math.round((done / stages.length) * 100) : 0;
  }

  const filtered = search
    ? projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.customer && p.customer.toLowerCase().includes(search.toLowerCase())))
    : projects;

  return (
    <div>
      <div className="px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">交付项目</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索项目..."
              className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
            />
          </div>
          <Link
            href={`/workspaces/${slug}/projects/new`}
            className="btn-primary"
          >
            新建项目
          </Link>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-6">
        {loading ? (
          <ListSkeleton count={5} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <FolderGit2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-lg mb-2">{search ? '未找到匹配的项目' : '还没有项目'}</p>
            <p className="text-sm mb-4">{search ? '尝试其他搜索词' : '创建你的第一个交付项目来启动 13 步流程'}</p>
            {!search && <Link href={`/workspaces/${slug}/projects/new`} className="text-blue-600 hover:underline text-sm">创建第一个项目</Link>}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => (
              <Link
                key={p.id}
                href={`/workspaces/${slug}/projects/${p.id}`}
                className="card-hover p-5 block"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">{p.name}</h3>
                    {p.customer && <p className="text-sm text-gray-500">客户: {p.customer}</p>}
                  </div>
                  <span className={
                    p.status === 'active' ? 'badge-success' :
                    p.status === 'completed' ? 'badge-primary' :
                    'badge-gray'
                  }>
                    {p.status === 'active' ? '进行中' : p.status === 'completed' ? '已完成' : '已归档'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${progress(p.stages)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{progress(p.stages)}%</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
