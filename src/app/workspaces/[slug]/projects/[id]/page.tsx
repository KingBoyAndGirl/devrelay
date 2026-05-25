'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { DetailSkeleton } from '@/components/ui/SkeletonLoader';
import { ROLE_LABELS } from '@/types';
import ActivityFeed from '@/components/activities/ActivityFeed';

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
  requiredRole: string | null;
  assignedTo: string | null;
  assignedAgentName: string | null;
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

interface Deployment {
  id: string;
  version: string | null;
  environment: string;
  status: string;
  deployedAt: string | null;
  createdAt: string;
}

interface FeedbackItem {
  id: string;
  type: string;
  title: string;
  severity: string;
  status: string;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  customer: string | null;
  status: string;
  stages: Stage[];
  latestDeployment: Deployment | null;
  recentFeedback: FeedbackItem[];
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
  const router = useRouter();
  const slug = routeParams.slug as string;
  const id = routeParams.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const [assigning, setAssigning] = useState<number | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [showReject, setShowReject] = useState<number | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showCompletedStages, setShowCompletedStages] = useState(false);
  const [editingRole, setEditingRole] = useState<number | null>(null);
  const [deployVersion, setDeployVersion] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [feedbackType, setFeedbackType] = useState('feedback');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackSeverity, setFeedbackSeverity] = useState('medium');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [showAgentAssign, setShowAgentAssign] = useState(false);
  const [workspaceAgents, setWorkspaceAgents] = useState<Array<{ id: string; name: string; role: string; type: string; assigned: boolean }>>([]);
  const [savingAgents, setSavingAgents] = useState(false);

  useEffect(() => {
    fetchProject();
  }, [id]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-role-dropdown]')) {
        setEditingRole(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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

  async function handleAutoAssign(step: number) {
    setAssigning(step);
    await fetch(`/api/projects/${id}/stages/auto-assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step }),
    });
    setAssigning(null);
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

  async function handleDeploy() {
    if (!deployVersion.trim()) return;
    setDeploying(true);
    const res = await fetch(`/api/projects/${id}/deployments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: deployVersion }),
    });
    if (res.ok) {
      // Simulate deployment success for demo
      const dep = await res.json();
      setTimeout(async () => {
        await fetch(`/api/projects/${id}/deployments`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deploymentId: dep.id, status: 'success', log: 'Deployed successfully' }),
        });
        fetchProject();
      }, 2000);
    }
    setDeploying(false);
    setDeployVersion('');
    fetchProject();
  }

  async function handleSubmitFeedback() {
    if (!feedbackTitle.trim()) return;
    setSubmittingFeedback(true);
    await fetch(`/api/projects/${id}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: feedbackType, title: feedbackTitle, severity: feedbackSeverity }),
    });
    setSubmittingFeedback(false);
    setFeedbackTitle('');
    setFeedbackType('feedback');
    fetchProject();
  }

  async function handleArchive() {
    await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    });
    toast.success('项目已归档');
    fetchProject();
  }

  async function handleUnarchive() {
    await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    toast.success('项目已恢复');
    fetchProject();
  }

  async function handleRoleChange(step: number, requiredRole: string) {
    setEditingRole(null);
    await fetch(`/api/projects/${id}/stages/${step}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requiredRole }),
    });
    fetchProject();
  }

  async function loadAgents() {
    const res = await fetch(`/api/projects/${id}/agents`);
    setWorkspaceAgents(await res.json());
    setShowAgentAssign(true);
  }

  async function saveAgents() {
    setSavingAgents(true);
    const agentIds = workspaceAgents.filter(a => a.assigned).map(a => a.id);
    await fetch(`/api/projects/${id}/agents`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentIds }),
    });
    setSavingAgents(false);
    setShowAgentAssign(false);
  }

  function toggleAgent(agentId: string) {
    setWorkspaceAgents(prev =>
      prev.map(a => a.id === agentId ? { ...a, assigned: !a.assigned } : a)
    );
  }

  async function handleDelete() {
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    toast.success('项目已删除');
    router.push(`/workspaces/${slug}/projects`);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <DetailSkeleton />
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
    <>
      {/* Progress bar */}
      <div className="px-6 py-3 space-y-2">
        {project.description && (
          <p className="text-sm text-gray-500">{project.description}</p>
        )}
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-200 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${allComplete ? 'bg-green-500' : 'bg-blue-600'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-sm font-medium">{progress}%</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-6">
        {/* Project actions */}
        <div className="flex items-center justify-end gap-2 mb-4">
          {project.status === 'active' && (
            <button onClick={handleArchive} className="btn btn-secondary btn-sm">归档项目</button>
          )}
          {project.status === 'archived' && (
            <button onClick={handleUnarchive} className="btn btn-secondary btn-sm">恢复项目</button>
          )}
          <button onClick={() => setConfirmDelete(true)} className="btn btn-danger btn-sm">删除项目</button>
          <button
            onClick={() => setShowCompletedStages(!showCompletedStages)}
            className="btn btn-ghost btn-sm"
          >
            {showCompletedStages ? '折叠已完成' : '展开已完成'}
          </button>
        </div>

        <div className="space-y-3">
          {project.stages.map((stage) => {
            const isCompleted = stage.status === 'completed';
            const isHidden = isCompleted && !showCompletedStages;
            return (
            <div
              key={stage.id}
              className={`border rounded-xl transition-all duration-300 ease-out ${STATUS_COLORS[stage.status]} ${
                isHidden ? 'max-h-0 opacity-0 overflow-hidden p-0 border-0' : 'max-h-[2000px] opacity-100'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-12">
                  <span className={`w-3 h-3 rounded-full ${STATUS_DOT[stage.status]}`} />
                  <span className="text-sm font-bold text-gray-400">{String(stage.step).padStart(2, '0')}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{stage.name}</h3>
                    <span className={
                      stage.status === 'completed' ? 'badge-success' :
                      stage.status === 'in_progress' ? 'badge-primary' :
                      stage.status === 'rejected' ? 'badge-error' :
                      'badge-gray'
                    }>
                      {STATUS_LABEL[stage.status]}
                    </span>
                    {(stage.status === 'pending' || stage.status === 'in_progress') ? (
                      <div className="relative" data-role-dropdown>
                        <button
                          onClick={() => setEditingRole(editingRole === stage.step ? null : stage.step)}
                          className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer"
                        >
                          {stage.requiredRole ? (ROLE_LABELS[stage.requiredRole] || stage.requiredRole) : '未设置'} ▾
                        </button>
                        {editingRole === stage.step && (
                          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[120px]">
                            {['developer', 'qa', 'delivery_manager', 'pm', 'architect'].map(role => (
                              <button
                                key={role}
                                onClick={() => handleRoleChange(stage.step, role)}
                                className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${
                                  stage.requiredRole === role ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                                }`}
                              >
                                {ROLE_LABELS[role] || role}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      stage.requiredRole && (
                        <span className="text-xs text-gray-400">
                          {ROLE_LABELS[stage.requiredRole] || stage.requiredRole}
                        </span>
                      )
                    )}
                    {stage.assignedAgentName && (
                      <span className="badge-success font-mono">
                        {stage.assignedAgentName}
                      </span>
                    )}
                    {(stage.status === 'pending' || stage.status === 'in_progress') && !stage.assignedTo && (
                      <button
                        onClick={() => handleAutoAssign(stage.step)}
                        disabled={assigning === stage.step}
                        className="badge-primary hover:opacity-80 disabled:opacity-50 cursor-pointer"
                      >
                        {assigning === stage.step ? '分配中...' : '自动分配'}
                      </button>
                    )}
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
                          <span className={
                            pr.state === 'open' ? 'badge-success' :
                            pr.state === 'merged' ? 'badge-purple' :
                            'badge-error'
                          }>
                            {pr.state === 'open' ? 'open' : pr.state === 'merged' ? 'merged' : pr.state}
                          </span>
                          {pr.sourceBranch && (
                            <span className="font-mono text-gray-400">{pr.sourceBranch}→{pr.targetBranch}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Stage 11: Deployment */}
                  {stage.step === 11 && (
                    <div className="mt-2 border-t border-gray-200 pt-2">
                      {project.latestDeployment && (
                        <div className="text-xs mb-2">
                          <span className="text-gray-500">最近部署: </span>
                          <span className="font-mono">{project.latestDeployment.version}</span>
                          <span className={
                            project.latestDeployment.status === 'success' ? 'badge-success' :
                            project.latestDeployment.status === 'failed' ? 'badge-error' :
                            project.latestDeployment.status === 'deploying' ? 'badge-primary' :
                            'badge-gray'
                          }>{project.latestDeployment.status}</span>
                          {project.latestDeployment.deployedAt && (
                            <span className="text-gray-400 ml-1">{new Date(project.latestDeployment.deployedAt).toLocaleString('zh-CN')}</span>
                          )}
                        </div>
                      )}
                      {stage.status === 'in_progress' && (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={deployVersion}
                            onChange={(e) => setDeployVersion(e.target.value)}
                            placeholder="版本号 (如 v1.0.0)"
                            className="input text-xs py-1"
                          />
                          <button
                            onClick={handleDeploy}
                            disabled={deploying || !deployVersion.trim()}
                            className="btn btn-primary btn-sm"
                          >
                            {deploying ? '部署中...' : '部署'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stage 13: Feedback */}
                  {stage.step === 13 && (
                    <div className="mt-2 border-t border-gray-200 pt-2">
                      {project.recentFeedback?.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {project.recentFeedback.map(f => (
                            <div key={f.id} className="text-xs flex items-center gap-2 bg-white rounded px-2 py-1 border border-gray-100">
                              <span className={
                                f.type === 'bug' ? 'badge-error' :
                                f.type === 'incident' ? 'badge-orange' :
                                'badge-primary'
                              }>{f.type}</span>
                              <span className="truncate">{f.title}</span>
                              <span className={
                                f.severity === 'critical' ? 'badge-error' :
                                f.severity === 'high' ? 'badge-orange' :
                                'badge-gray'
                              }>{f.severity}</span>
                              <span className={
                                f.status === 'open' ? 'badge-warning' :
                                f.status === 'resolved' ? 'badge-success' :
                                'badge-gray'
                              }>{f.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <select
                          value={feedbackType}
                          onChange={(e) => setFeedbackType(e.target.value)}
                          className="select text-xs py-1"
                        >
                          <option value="feedback">反馈</option>
                          <option value="bug">Bug</option>
                          <option value="incident">事故</option>
                          <option value="improvement">改进</option>
                        </select>
                        <select
                          value={feedbackSeverity}
                          onChange={(e) => setFeedbackSeverity(e.target.value)}
                          className="select text-xs py-1"
                        >
                          <option value="low">低</option>
                          <option value="medium">中</option>
                          <option value="high">高</option>
                          <option value="critical">严重</option>
                        </select>
                        <input
                          type="text"
                          value={feedbackTitle}
                          onChange={(e) => setFeedbackTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitFeedback(); }}
                          placeholder="反馈标题..."
                          className="input text-xs py-1 flex-1"
                        />
                        <button
                          onClick={handleSubmitFeedback}
                          disabled={submittingFeedback || !feedbackTitle.trim()}
                          className="btn btn-sm bg-orange-600 text-white hover:bg-orange-700"
                        >
                          提交
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Comments section */}
                  <button
                    onClick={() => toggleComments(stage.id)}
                    className="text-xs text-gray-400 hover:text-gray-600 mt-2 flex items-center gap-1"
                  >
                    <MessageSquare size={12} />
                    <span>讨论</span>
                    {expandedComments.has(stage.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
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
                          className="input text-sm py-1 flex-1"
                        />
                        <button
                          onClick={() => handlePostComment(stage.id)}
                          disabled={submittingComment[stage.id]}
                          className="btn btn-primary btn-sm"
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
                          className="input text-sm py-1 border-red-300"
                        />
                        <button
                          onClick={() => handleReject(stage.step)}
                          disabled={acting === stage.step}
                          className="btn btn-danger btn-sm"
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
                          className="btn btn-success btn-sm"
                        >
                          {acting === stage.step ? '...' : '通过'}
                        </button>
                        <button
                          onClick={() => setShowReject(stage.step)}
                          disabled={acting === stage.step}
                          className="btn btn-danger btn-sm"
                        >
                          驳回
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
          })}
        </div>

        {/* Agent Assignment */}
        <div className="mt-8 card p-5">
          <button
            onClick={() => showAgentAssign ? setShowAgentAssign(false) : loadAgents()}
            className="flex items-center justify-between w-full text-left"
          >
            <h3 className="font-semibold">Agent 分配</h3>
            <span className="text-xs text-gray-400">{showAgentAssign ? '收起' : '展开'}</span>
          </button>

          {showAgentAssign && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              {workspaceAgents.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">暂无 Agent</p>
              ) : (
                <div className="space-y-2">
                  {workspaceAgents.map(agent => (
                    <label
                      key={agent.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={agent.assigned}
                        onChange={() => toggleAgent(agent.id)}
                        className="rounded"
                      />
                      <span className="font-medium text-sm flex-1">{agent.name}</span>
                      <span className="text-xs text-gray-400">{agent.type}</span>
                      <span className="badge-primary">
                        {ROLE_LABELS[agent.role] || agent.role}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={saveAgents}
                  disabled={savingAgents}
                  className="btn-primary"
                >
                  {savingAgents ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="mt-8">
          <div className="card p-5">
            <h3 className="section-title mb-4">最近活动</h3>
            <ActivityFeed projectId={id} limit={20} />
          </div>
        </div>
      </div>
      <ConfirmModal
        open={confirmDelete}
        title="删除项目"
        message="确定删除此项目？所有关联的任务、阶段和文档将被删除。此操作不可撤销。"
        confirmLabel="删除"
        variant="danger"
        onConfirm={() => { setConfirmDelete(false); handleDelete(); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
