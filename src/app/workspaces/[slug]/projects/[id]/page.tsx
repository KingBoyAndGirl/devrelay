'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface LinkedPR {
  id: string;
  prNumber: number;
  title: string;
  state: string;
  sourceBranch: string | null;
  targetBranch: string | null;
}

interface Stage {
  id: string;
  step: number;
  name: string;
  status: string;
  reviewNotes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  linkedPRs: LinkedPR[];
}

interface Comment {
  id: string;
  userId: string;
  userName: string | null;
  content: string;
  stageId: string | null;
  createdAt: string;
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
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<Record<string, boolean>>({});

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

  async function toggleComments(stageId: string) {
    const next = new Set(expandedComments);
    if (next.has(stageId)) {
      next.delete(stageId);
    } else {
      next.add(stageId);
      if (!comments[stageId]) {
        const res = await fetch(`/api/projects/${id}/comments?stageId=${stageId}`);
        const data = await res.json();
        setComments(prev => ({ ...prev, [stageId]: data }));
      }
    }
    setExpandedComments(next);
  }

  async function handlePostComment(stageId: string) {
    const text = commentText[stageId];
    if (!text?.trim()) return;
    setSubmittingComment(prev => ({ ...prev, [stageId]: true }));
    await fetch(`/api/projects/${id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text, stageId }),
    });
    setSubmittingComment(prev => ({ ...prev, [stageId]: false }));
    setCommentText(prev => ({ ...prev, [stageId]: '' }));
    const res = await fetch(`/api/projects/${id}/comments?stageId=${stageId}`);
    const data = await res.json();
    setComments(prev => ({ ...prev, [stageId]: data }));
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
                  {stage.linkedPRs.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {stage.linkedPRs.map(pr => (
                        <div key={pr.id} className="text-xs flex items-center gap-2 bg-white rounded px-2 py-1 border border-gray-200">
                          <span className="font-mono text-gray-500">#{pr.prNumber}</span>
                          <span className="truncate">{pr.title}</span>
                          <span className={`px-1 rounded ${
                            pr.state === 'open' ? 'bg-green-100 text-green-700' :
                            pr.state === 'merged' ? 'bg-purple-100 text-purple-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {pr.state === 'open' ? 'open' : pr.state === 'merged' ? 'merged' : pr.state}
                          </span>
                          {pr.sourceBranch && (
                            <span className="font-mono text-gray-400">{pr.sourceBranch}→{pr.targetBranch}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Comments section */}
                  <button
                    onClick={() => toggleComments(stage.id)}
                    className="text-xs text-gray-400 hover:text-gray-600 mt-2 flex items-center gap-1"
                  >
                    <span>讨论</span>
                    {expandedComments.has(stage.id) ? '▲' : '▼'}
                  </button>

                  {expandedComments.has(stage.id) && (
                    <div className="mt-2 space-y-2">
                      {(comments[stage.id] || []).map(c => (
                        <div key={c.id} className="bg-white rounded px-3 py-2 border border-gray-100">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium">{c.userName || c.userId}</span>
                            <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleString('zh-CN')}</span>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>
                        </div>
                      ))}
                      {(!comments[stage.id] || comments[stage.id].length === 0) && (
                        <p className="text-xs text-gray-400">暂无评论</p>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={commentText[stage.id] || ''}
                          onChange={(e) => setCommentText(prev => ({ ...prev, [stage.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') handlePostComment(stage.id); }}
                          placeholder="添加评论..."
                          className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded"
                        />
                        <button
                          onClick={() => handlePostComment(stage.id)}
                          disabled={submittingComment[stage.id]}
                          className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          {submittingComment[stage.id] ? '...' : '发送'}
                        </button>
                      </div>
                    </div>
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
