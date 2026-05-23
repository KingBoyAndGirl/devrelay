'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

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
  const [testing, setTesting] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    fetch(`/api/workspaces/${slug}/repos`)
      .then(r => r.json())
      .then(data => { setRepos(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  async function handleDelete(repoId: string, name: string) {
    if (!confirm(`确定要解绑仓库 "${name}"？`)) return;
    const res = await fetch(`/api/workspaces/${slug}/repos/${repoId}`, { method: 'DELETE' });
    if (res.ok) {
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

  return (
    <div>
      <div className="px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">仓库管理</h1>
        <Link
          href={`/workspaces/${slug}/repos/new`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          添加仓库
        </Link>
      </div>

      <main className="max-w-4xl mx-auto p-6">
        {statusMsg && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{statusMsg}</div>
        )}

        {loading ? (
          <p className="text-gray-500">加载中...</p>
        ) : repos.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg mb-2">还没有关联仓库</p>
            <p className="text-sm mb-4">添加 GitHub 仓库来开始管理代码</p>
            <Link href={`/workspaces/${slug}/repos/new`} className="text-blue-600 hover:underline text-sm">添加第一个仓库</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {repos.map((repo) => (
              <div key={repo.id} className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between">
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
                      className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      {testing === repo.id ? '检测中...' : '测试连接'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(repo.id, repo.name)}
                    className="px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    解绑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
