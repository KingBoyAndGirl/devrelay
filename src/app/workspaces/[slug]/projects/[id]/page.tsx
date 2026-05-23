'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Stage {
  id: string;
  step: number;
  name: string;
  status: string;
  reviewNotes: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  customer: string | null;
  status: string;
  stages: Stage[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 border-gray-300',
  in_progress: 'bg-blue-50 border-blue-400',
  completed: 'bg-green-50 border-green-400',
  rejected: 'bg-red-50 border-red-400',
};

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-gray-400',
  in_progress: 'bg-blue-500 animate-pulse',
  completed: 'bg-green-500',
  rejected: 'bg-red-500',
};

const STATUS_LABEL: Record<string, string> = {
  pending: '待开始',
  in_progress: '进行中',
  completed: '已完成',
  rejected: '已驳回',
};

export default function ProjectDetailPage() {
  const routeParams = useParams();
  const slug = routeParams.slug as string;
  const id = routeParams.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [showReject, setShowReject] = useState<number | null>(null);

  useEffect(() => {
    fetchProject();
  }, [id]);

  async function fetchProject() {
    const res = await fetch(`/api/projects/${id}`);
    const data = await res.json();
    setProject(data);
    setLoading(false);
  }

  async function handleApprove(step: number) {
    setActing(step);
    await fetch(`/api/projects/${id}/stages/${step}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
    setActing(null);
    fetchProject();
  }

  async function handleReject(step: number) {
    setActing(step);
    await fetch(`/api/projects/${id}/stages/${step}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', reviewNotes: rejectNotes }),
    });
    setActing(null);
    setShowReject(null);
    setRejectNotes('');
    fetchProject();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">项目未找到</p>
      </div>
    );
  }

  const progress = project.stages.length
    ? Math.round((project.stages.filter(s => s.status === 'completed').length / project.stages.length) * 100)
    : 0;

  const allComplete = project.stages.every(s => s.status === 'completed');

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4 mb-3">
          <Link href={`/workspaces/${slug}/projects`} className="text-gray-500 hover:text-gray-700">&larr; 项目列表</Link>
          <h1 className="text-xl font-bold">{project.name}</h1>
          {project.customer && <span className="text-sm text-gray-500">客户: {project.customer}</span>}
        </div>
        {project.description && (
          <p className="text-sm text-gray-500 mb-3">{project.description}</p>
        )}
        <div className="flex items-center gap-3 mb-3">
          <Link
            href={`/workspaces/${slug}/projects/${id}/documents`}
            className="text-sm text-blue-600 hover:underline"
          >
            文档中心
          </Link>
          <Link
            href={`/workspaces/${slug}/projects/${id}/tasks`}
            className="text-sm text-blue-600 hover:underline"
          >
            任务看板
          </Link>
          <Link
            href={`/workspaces/${slug}/projects/${id}/prs`}
            className="text-sm text-blue-600 hover:underline"
          >
            Pull Requests
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${allComplete ? 'bg-green-500' : 'bg-blue-600'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-sm font-medium">{progress}%</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        <div className="space-y-3">
          {project.stages.map((stage) => (
            <div
              key={stage.id}
              className={`border rounded-xl p-4 ${STATUS_COLORS[stage.status]} transition-colors`}
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-12">
                  <span className={`w-3 h-3 rounded-full ${STATUS_DOT[stage.status]}`} />
                  <span className="text-sm font-bold text-gray-400">{String(stage.step).padStart(2, '0')}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{stage.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      stage.status === 'completed' ? 'bg-green-200 text-green-800' :
                      stage.status === 'in_progress' ? 'bg-blue-200 text-blue-800' :
                      stage.status === 'rejected' ? 'bg-red-200 text-red-800' :
                      'bg-gray-200 text-gray-600'
                    }`}>
                      {STATUS_LABEL[stage.status]}
                    </span>
                  </div>
                  {stage.startedAt && (
                    <p className="text-xs text-gray-400 mt-1">
                      开始: {new Date(stage.startedAt).toLocaleString('zh-CN')}
                      {stage.completedAt && ` · 完成: ${new Date(stage.completedAt).toLocaleString('zh-CN')}`}
                    </p>
                  )}
                  {stage.reviewNotes && (
                    <p className="text-sm text-red-600 mt-2 bg-red-50 rounded p-2">{stage.reviewNotes}</p>
                  )}
                </div>
                {stage.status === 'in_progress' && (
                  <div className="flex gap-2">
                    {showReject === stage.step ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={rejectNotes}
                          onChange={(e) => setRejectNotes(e.target.value)}
                          placeholder="驳回原因..."
                          className="px-2 py-1 text-sm border border-red-300 rounded"
                        />
                        <button
                          onClick={() => handleReject(stage.step)}
                          disabled={acting === stage.step}
                          className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                        >
                          确认
                        </button>
                        <button
                          onClick={() => { setShowReject(null); setRejectNotes(''); }}
                          className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleApprove(stage.step)}
                          disabled={acting === stage.step}
                          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          {acting === stage.step ? '...' : '通过'}
                        </button>
                        <button
                          onClick={() => setShowReject(stage.step)}
                          disabled={acting === stage.step}
                          className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                        >
                          驳回
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
