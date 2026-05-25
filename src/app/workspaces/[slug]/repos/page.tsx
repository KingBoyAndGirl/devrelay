'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Database, Search } from 'lucide-react';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { ListSkeleton } from '@/components/ui/SkeletonLoader';

interface Repo {
  id: string;
  name: string;
  provider: string;
  remoteUrl: string;
  defaultBranch: string;
  accessToken: string | null;
  createdAt: string;
}

export default function ReposPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [testing, setTesting] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [confirmDeleteRepo, setConfirmDeleteRepo] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetch(`/api/workspaces/${slug}/repos`)
      .then(r => r.json())
      .then(data => { setRepos(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  async function handleDelete(repoId: string) {
    const res = await fetch(`/api/workspaces/${slug}/repos/${repoId}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('仓库已解绑');
      setRepos(repos.filter(r => r.id !== repoId));
    }
  }

  async function handleTest(repoId: string) {
    setTesting(repoId);
    const res = await fetch(`/api/workspaces/${slug}/repos/${repoId}`, { method: 'POST' });
    const data = await res.json();
    setStatusMsg(data.connected ? `连接正常 - ${data.login}` : '连接失败');
    setTesting(null);
    setTimeout(() => setStatusMsg(''), 3000);
  }

  const filteredRepos = search
    ? repos.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.remoteUrl.toLowerCase().includes(search.toLowerCase()))
    : repos;

  return (
    <>
      <div className="px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">仓库管理</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索仓库..."
              className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
            />
          </div>
          <Link
            href={`/workspaces/${slug}/repos/new`}
            className="btn-primary"
          >
            添加仓库
          </Link>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-6">
        {statusMsg && (
          <div className="alert-success mb-4">{statusMsg}</div>
        )}

        {loading ? (
          <ListSkeleton count={5} />
        ) : filteredRepos.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <Database className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-lg mb-2">{search ? '未找到匹配的仓库' : '还没有关联仓库'}</p>
            <p className="text-sm mb-4">{search ? '尝试其他搜索词' : '添加 GitHub 仓库来开始管理代码'}</p>
            {!search && <Link href={`/workspaces/${slug}/repos/new`} className="text-blue-600 hover:underline text-sm">添加第一个仓库</Link>}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRepos.map((repo) => (
              <div key={repo.id} className="card p-5 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{repo.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {repo.remoteUrl} &middot; 默认分支: {repo.defaultBranch}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    添加于 {new Date(repo.createdAt).toLocaleDateString('zh-CN')}
                    {repo.accessToken ? ' · 已授权' : ' · 未授权'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {repo.accessToken && (
                    <button
                      onClick={() => handleTest(repo.id)}
                      disabled={testing === repo.id}
                      className="btn btn-secondary btn-sm"
                    >
                      {testing === repo.id ? '检测中...' : '测试连接'}
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmDeleteRepo({ id: repo.id, name: repo.name })}
                    className="btn btn-danger btn-sm"
                  >
                    解绑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <ConfirmModal
        open={confirmDeleteRepo !== null}
        title="解绑仓库"
        message={`确定要解绑仓库 "${confirmDeleteRepo?.name}"？`}
        confirmLabel="解绑"
        variant="danger"
        onConfirm={() => { const id = confirmDeleteRepo!.id; setConfirmDeleteRepo(null); handleDelete(id); }}
        onCancel={() => setConfirmDeleteRepo(null)}
      />
    </>
  );
}
