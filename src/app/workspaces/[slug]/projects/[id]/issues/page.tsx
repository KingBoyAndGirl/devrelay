'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface GitHubIssue {
  id: string;
  repositoryId: string;
  issueNumber: number;
  title: string;
  body: string | null;
  state: string;
  labels: string | null;
  devrelayTaskId: string | null;
  updatedAt: string;
}

const STATE_COLORS: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  closed: 'bg-red-100 text-red-700',
};

export default function IssuesPage() {
  const routeParams = useParams();
  const slug = routeParams.slug as string;
  const projectId = routeParams.id as string;

  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [syncResult, setSyncResult] = useState('');

  useEffect(() => { fetchIssues(); }, [projectId]);

  async function fetchIssues() {
    const res = await fetch(`/api/projects/${projectId}/issues`);
    const data = await res.json();
    setIssues(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult('');
    const res = await fetch(`/api/projects/${projectId}/issues`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      setSyncResult(`已同步 ${data.synced} 个 Issues`);
      fetchIssues();
    } else {
      setSyncResult(data.error || '同步失败');
    }
    setSyncing(false);
    setTimeout(() => setSyncResult(''), 3000);
  }

  const filtered = filter === 'all' ? issues : issues.filter(i => i.state === filter);

  return (
    <div>
      <main className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold">GitHub Issues</h1>
            <div className="flex gap-1">
              {(['all', 'open', 'closed'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-xs px-2 py-1 rounded ${
                    filter === f ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {f === 'all' ? '全部' : f === 'open' ? '开放' : '已关闭'}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {syncing ? '同步中...' : '同步 Issues'}
          </button>
        </div>

        {syncResult && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
            {syncResult}
          </div>
        )}

        {loading ? (
          <p className="text-gray-500 text-center py-10">加载中...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg mb-2">还没有同步的 Issues</p>
            <p className="text-sm">点击"同步 Issues"从 GitHub 拉取 Issues</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((issue) => (
              <div key={issue.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-gray-500 shrink-0">
                        #{issue.issueNumber}
                      </span>
                      <h3 className="font-semibold truncate">{issue.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${STATE_COLORS[issue.state] || ''}`}>
                        {issue.state === 'open' ? '开放' : '已关闭'}
                      </span>
                    </div>
                    {issue.body && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{issue.body}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      {issue.labels && (
                        <div className="flex gap-1">
                          {(() => {
                            try {
                              return (JSON.parse(issue.labels) as string[]).map((l: string, i: number) => (
                                <span key={i} className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                                  {l}
                                </span>
                              ));
                            } catch { return null; }
                          })()}
                        </div>
                      )}
                      {issue.devrelayTaskId && (
                        <Link
                          href={`/workspaces/${slug}/projects/${projectId}/tasks/${issue.devrelayTaskId}`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          查看关联任务
                        </Link>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(issue.updatedAt).toLocaleString('zh-CN')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
