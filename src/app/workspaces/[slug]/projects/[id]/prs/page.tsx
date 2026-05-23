'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface PR {
  id: string;
  prNumber: number;
  title: string;
  body: string | null;
  state: string;
  sourceBranch: string | null;
  targetBranch: string | null;
  commitSha: string | null;
  updatedAt: string;
}

export default function PRsPage() {
  const routeParams = useParams();
  const slug = routeParams.slug as string;
  const projectId = routeParams.id as string;

  const [prs, setPrs] = useState<PR[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [repoId, setRepoId] = useState('');
  const [title, setTitle] = useState('');
  const [head, setHead] = useState('');
  const [base, setBase] = useState('main');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [repos, setRepos] = useState<Array<{ id: string; name: string; accessToken: string | null }>>([]);

  useEffect(() => {
    fetchPRs();
    fetchRepos();
  }, [projectId]);

  async function fetchPRs() {
    const res = await fetch(`/api/projects/${projectId}/prs`);
    setPrs(await res.json());
    setLoading(false);
  }

  async function fetchRepos() {
    const res = await fetch(`/api/workspaces/${slug}/repos`);
    const data = await res.json();
    setRepos(data.filter((r: any) => r.accessToken));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    const res = await fetch(`/api/projects/${projectId}/prs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositoryId: repoId, title, head, base }),
    });
    if (res.ok) {
      setShowCreate(false);
      fetchPRs();
    } else {
      const data = await res.json();
      setError(data.error || '创建失败');
    }
    setCreating(false);
  }

  const STATE_COLORS: Record<string, string> = {
    open: 'bg-green-100 text-green-700',
    closed: 'bg-red-100 text-red-700',
    merged: 'bg-purple-100 text-purple-700',
  };

  return (
    <div>
      <div className="px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">Pull Requests</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
          disabled={repos.length === 0}
          title={repos.length === 0 ? '需要先添加有 Token 的仓库' : ''}
        >
          {showCreate ? '取消' : '创建 PR'}
        </button>
      </div>

      <main className="max-w-4xl mx-auto p-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {showCreate && (
          <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-5 mb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">仓库</label>
              <select
                value={repoId}
                onChange={(e) => setRepoId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              >
                <option value="">选择仓库...</option>
                {repos.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">源分支 (head)</label>
                <input type="text" value={head} onChange={(e) => setHead(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm" placeholder="feature/xxx" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目标分支 (base)</label>
                <input type="text" value={base} onChange={(e) => setBase(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm" required />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PR 标题</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="PR 标题" required />
            </div>
            <button type="submit" disabled={creating} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {creating ? '创建中...' : '创建 PR'}
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-gray-500">加载中...</p>
        ) : prs.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg mb-2">还没有 PR</p>
            <p className="text-sm">通过 Webhook 自动同步或手动创建 PR</p>
          </div>
        ) : (
          <div className="space-y-3">
            {prs.map(pr => (
              <div key={pr.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-gray-500">#{pr.prNumber}</span>
                      <h3 className="font-semibold">{pr.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded ${STATE_COLORS[pr.state] || ''}`}>
                        {pr.state === 'open' ? '开放' : pr.state === 'closed' ? '已关闭' : pr.state === 'merged' ? '已合并' : pr.state}
                      </span>
                    </div>
                    {pr.sourceBranch && (
                      <p className="text-xs text-gray-400 mt-1 font-mono">
                        {pr.sourceBranch} → {pr.targetBranch}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{new Date(pr.updatedAt).toLocaleString('zh-CN')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
