'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CircleDot } from 'lucide-react';
import { ListSkeleton } from '@/components/ui/SkeletonLoader';

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
  open: 'badge-success',
  closed: 'badge-error',
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
      <main className="max-w-6xl mx-auto p-6">
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
            className="btn-primary"
          >
            {syncing ? '同步中...' : '同步 Issues'}
          </button>
        </div>

        {syncResult && (
          <div className="alert-success mb-4">
            {syncResult}
          </div>
        )}

        {loading ? (
          <ListSkeleton count={5} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <CircleDot className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-lg mb-2">还没有同步的 Issues</p>
            <p className="text-sm">点击"同步 Issues"从 GitHub 拉取 Issues</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((issue) => (
              <div key={issue.id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-gray-500 shrink-0">
                        #{issue.issueNumber}
                      </span>
                      <h3 className="font-semibold truncate">{issue.title}</h3>
                      <span className={STATE_COLORS[issue.state] || 'badge-gray'}>
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
                                <span key={i} className="badge-purple">
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
