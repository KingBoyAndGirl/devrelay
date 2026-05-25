'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { DetailSkeleton } from '@/components/ui/SkeletonLoader';
import ActivityFeed from '@/components/activities/ActivityFeed';
import { KeyboardShortcuts } from '@/components/ui/KeyboardShortcuts';
import { StageCard } from './StageCard';
import { StageTimeline } from './StageTimeline';
import { AgentAssignmentPanel } from './AgentAssignmentPanel';
import { OnboardingTooltip } from '@/components/ui/OnboardingTooltip';
import type { Project, Comment, WorkspaceAgent } from './types';

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
  const [focusMode, setFocusMode] = useState(true);
  const [editingRole, setEditingRole] = useState<number | null>(null);
  const [deployVersion, setDeployVersion] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [feedbackType, setFeedbackType] = useState('feedback');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackSeverity, setFeedbackSeverity] = useState('medium');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [showAgentAssign, setShowAgentAssign] = useState(false);
  const [workspaceAgents, setWorkspaceAgents] = useState<WorkspaceAgent[]>([]);
  const [savingAgents, setSavingAgents] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [pinnedActivity, setPinnedActivity] = useState(false);

  useEffect(() => {
    fetchProject();
  }, [id]);

  // Socket.io real-time collaboration
  useEffect(() => {
    const socket: Socket = io({ transports: ['websocket', 'polling'] });

    socket.emit('subscribe:project', id);

    socket.on('stage_update', (data: {
      projectId: string; step: number; stageName: string;
      status: string; reviewNotes: string; action: string;
      userId: string; userName: string;
    }) => {
      setProject(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          stages: prev.stages.map(s =>
            s.step === data.step
              ? {
                  ...s,
                  status: data.status,
                  ...(data.reviewNotes ? { reviewNotes: data.reviewNotes } : {}),
                  ...(data.status === 'completed' ? { completedAt: new Date().toISOString() } : {}),
                }
              : s
          ),
        };
      });
    });

    socket.on('comment', (comment: Comment) => {
      const sid = comment.stageId;
      if (sid) {
        setComments(prev => ({
          ...prev,
          [sid]: [comment, ...(prev[sid] || [])],
        }));
      }
    });

    return () => {
      socket.emit('unsubscribe:project', id);
      socket.disconnect();
    };
  }, [id]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
        return;
      }

      if (!project) return;

      const inProgress = project.stages.filter(s => s.status === 'in_progress');

      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        if (inProgress.length === 1) handleApprove(inProgress[0].step);
      }

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (inProgress.length === 1) {
          const step = inProgress[0].step;
          setShowReject(prev => prev === step ? null : step);
        }
      }

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        const idx = project.stages.findIndex(s => s.status === 'in_progress');
        if (idx >= 0 && idx < project.stages.length - 1) {
          document.getElementById(`stage-${project.stages[idx + 1].step}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        const idx = project.stages.findIndex(s => s.status === 'in_progress');
        if (idx > 0) {
          document.getElementById(`stage-${project.stages[idx - 1].step}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (inProgress.length === 1) {
          const stageId = inProgress[0].id;
          setExpandedComments(prev => {
            const next = new Set(prev);
            next.add(stageId);
            return next;
          });
          setTimeout(() => {
            const el = document.querySelector(`[data-comment-input="${stageId}"]`) as HTMLInputElement;
            el?.focus();
          }, 100);
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-role-dropdown]')) {
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
    const prevStages = [...project!.stages];
    setProject(prev => ({
      ...prev!,
      stages: prev!.stages.map(s =>
        s.step === step ? { ...s, status: 'completed', completedAt: new Date().toISOString() } : s
      ),
    }));
    setActing(step);
    try {
      await fetch(`/api/projects/${id}/stages/${step}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      toast.success(`阶段 ${step} 已通过`);
    } catch {
      setProject(prev => ({ ...prev!, stages: prevStages }));
      toast.error('操作失败，请重试');
    } finally {
      setActing(null);
      fetchProject();
    }
  }

  async function handleAutoAssign(step: number) {
    setAssigning(step);
    try {
      await fetch(`/api/projects/${id}/stages/auto-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step }),
      });
      toast.success(`阶段 ${step} 已自动分配`);
    } catch {
      toast.error('分配失败');
    } finally {
      setAssigning(null);
      fetchProject();
    }
  }

  async function handleReject(step: number) {
    const prevStages = [...project!.stages];
    setProject(prev => ({
      ...prev!,
      stages: prev!.stages.map(s =>
        s.step === step ? { ...s, status: 'rejected', reviewNotes: rejectNotes } : s
      ),
    }));
    setShowReject(null);
    setActing(step);
    try {
      await fetch(`/api/projects/${id}/stages/${step}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reviewNotes: rejectNotes }),
      });
      toast.success(`阶段 ${step} 已驳回`);
    } catch {
      setProject(prev => ({ ...prev!, stages: prevStages }));
      toast.error('操作失败，请重试');
    } finally {
      setActing(null);
      setRejectNotes('');
      fetchProject();
    }
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

    const tempId = `temp-${Date.now()}`;
    const optimisticComment: Comment = {
      id: tempId, userId: '', userName: null,
      content: text, stageId, createdAt: new Date().toISOString(),
    };
    setComments(prev => ({
      ...prev,
      [stageId]: [optimisticComment, ...(prev[stageId] || [])],
    }));
    setCommentText(prev => ({ ...prev, [stageId]: '' }));

    try {
      await fetch(`/api/projects/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, stageId }),
      });
      const res = await fetch(`/api/projects/${id}/comments?stageId=${stageId}`);
      const data = await res.json();
      setComments(prev => ({ ...prev, [stageId]: data }));
    } catch {
      setComments(prev => ({
        ...prev,
        [stageId]: (prev[stageId] || []).filter(c => c.id !== tempId),
      }));
      toast.error('评论发送失败');
    } finally {
      setSubmittingComment(prev => ({ ...prev, [stageId]: false }));
    }
  }

  async function handleDeploy() {
    if (!deployVersion.trim()) return;
    setDeploying(true);
    try {
      const res = await fetch(`/api/projects/${id}/deployments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: deployVersion }),
      });
      if (res.ok) {
        toast.success(`部署 ${deployVersion} 已开始`);
        const dep = await res.json();
        setTimeout(async () => {
          await fetch(`/api/projects/${id}/deployments`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deploymentId: dep.id, status: 'success', log: 'Deployed successfully' }),
          });
          toast.success('部署完成');
          fetchProject();
        }, 2000);
      } else {
        toast.error('部署失败');
      }
    } catch {
      toast.error('部署请求失败');
    } finally {
      setDeploying(false);
      setDeployVersion('');
    }
  }

  async function handleSubmitFeedback() {
    if (!feedbackTitle.trim()) return;
    setSubmittingFeedback(true);
    try {
      await fetch(`/api/projects/${id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: feedbackType, title: feedbackTitle, severity: feedbackSeverity }),
      });
      toast.success('反馈已提交');
    } catch {
      toast.error('提交失败');
    } finally {
      setSubmittingFeedback(false);
      setFeedbackTitle('');
      setFeedbackType('feedback');
      fetchProject();
    }
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
    const prevStages = [...project!.stages];
    setProject(prev => ({
      ...prev!,
      stages: prev!.stages.map(s =>
        s.step === step ? { ...s, requiredRole } : s
      ),
    }));
    setEditingRole(null);
    try {
      await fetch(`/api/projects/${id}/stages/${step}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requiredRole }),
      });
      toast.success('角色已更新');
    } catch {
      setProject(prev => ({ ...prev!, stages: prevStages }));
      toast.error('更新失败');
    }
  }

  async function loadAgents() {
    const res = await fetch(`/api/projects/${id}/agents`);
    setWorkspaceAgents(await res.json());
    setShowAgentAssign(true);
  }

  async function saveAgents() {
    setSavingAgents(true);
    const agentIds = workspaceAgents.filter(a => a.assigned).map(a => a.id);
    try {
      await fetch(`/api/projects/${id}/agents`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentIds }),
      });
      toast.success('Agent 分配已保存');
    } catch {
      toast.error('保存失败');
    } finally {
      setSavingAgents(false);
      setShowAgentAssign(false);
    }
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

  // ── Render ──────────────────────────────────────────────

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
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          {/* View mode toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setFocusMode(false)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                !focusMode ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              全部展示
            </button>
            <button
              onClick={() => setFocusMode(true)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                focusMode ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              聚焦当前
            </button>
          </div>

          <div className="flex items-center gap-2">
            {project.status === 'active' && (
              <button onClick={handleArchive} className="btn btn-secondary btn-sm">归档项目</button>
            )}
            {project.status === 'archived' && (
              <button onClick={handleUnarchive} className="btn btn-secondary btn-sm">恢复项目</button>
            )}
            <button onClick={() => setConfirmDelete(true)} className="btn btn-danger btn-sm">删除项目</button>
            {!focusMode && (
              <button
                onClick={() => setShowCompletedStages(!showCompletedStages)}
                className="btn btn-ghost btn-sm"
              >
                {showCompletedStages ? '折叠已完成' : '展开已完成'}
              </button>
            )}
            <button
              onClick={() => setShowActivity(!showActivity)}
              className={`btn btn-sm ${
                showActivity ? 'bg-blue-100 text-blue-700' : 'btn-ghost'
              }`}
            >
              活动
            </button>
            <button
              onClick={() => setShowShortcuts(true)}
              className="btn btn-ghost btn-sm font-mono"
              title="键盘快捷键"
            >
              ?
            </button>
          </div>
        </div>

        {/* Stage Timeline */}
        <StageTimeline
          stages={project.stages}
          onSelectStage={(step) => {
            if (focusMode) {
              setFocusMode(false);
              setShowCompletedStages(true);
            }
            setTimeout(() => {
              document.getElementById(`stage-${step}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
          }}
        />

        {/* Stage list */}
        <div className="space-y-3">
          {project.stages
            .filter(stage => {
              if (focusMode) {
                // Show in-progress, next pending, and rejected stages
                if (stage.status === 'in_progress' || stage.status === 'rejected') return true;
                // Show the first pending stage after in-progress
                const inProgressIdx = project.stages.findIndex(s => s.status === 'in_progress');
                if (inProgressIdx >= 0) {
                  const pendingAfter = project.stages.slice(inProgressIdx + 1).find(s => s.status === 'pending');
                  if (pendingAfter && stage.step === pendingAfter.step) return true;
                }
                return false;
              }
              return true;
            })
            .map((stage, idx) => {
              const isNewProject = project.stages.every(s => s.status === 'pending');
              const card = (
                <StageCard
                  key={stage.id}
                  stage={stage}
                  projectId={id}
              isHidden={!focusMode && stage.status === 'completed' && !showCompletedStages}
              acting={acting}
              assigning={assigning}
              showReject={showReject}
              editingRole={editingRole}
              rejectNotes={rejectNotes}
              expandedComments={expandedComments}
              comments={comments}
              commentText={commentText}
              submittingComment={submittingComment}
              latestDeployment={project.latestDeployment}
              recentFeedback={project.recentFeedback}
              deployVersion={deployVersion}
              deploying={deploying}
              feedbackType={feedbackType}
              feedbackTitle={feedbackTitle}
              feedbackSeverity={feedbackSeverity}
              submittingFeedback={submittingFeedback}
              onApprove={handleApprove}
              onReject={handleReject}
              onAutoAssign={handleAutoAssign}
              onRoleChange={handleRoleChange}
              onSetEditingRole={setEditingRole}
              onSetShowReject={setShowReject}
              onRejectNotesChange={setRejectNotes}
              onToggleComments={toggleComments}
              onCommentTextChange={(stageId, text) => setCommentText(prev => ({ ...prev, [stageId]: text }))}
              onPostComment={handlePostComment}
              onDeployVersionChange={setDeployVersion}
              onDeploy={handleDeploy}
              onFeedbackTypeChange={setFeedbackType}
              onFeedbackTitleChange={setFeedbackTitle}
              onFeedbackSeverityChange={setFeedbackSeverity}
              onFeedbackSubmit={handleSubmitFeedback}
                />
              );
              if (idx === 0 && isNewProject) {
                return (
                  <OnboardingTooltip
                    key={stage.id}
                    id="project-first-stage"
                    title="从这里开始"
                    description="这是项目的第一个交付阶段。点击「通过」推进进度，或使用键盘快捷键 A/R 快速操作。按 ? 查看更多快捷键。"
                    position="bottom"
                  >
                    {card}
                  </OnboardingTooltip>
                );
              }
              return card;
            })}
        </div>

        {/* Agent Assignment */}
        <AgentAssignmentPanel
          show={showAgentAssign}
          agents={workspaceAgents}
          saving={savingAgents}
          onToggle={() => showAgentAssign ? setShowAgentAssign(false) : loadAgents()}
          onAgentToggle={toggleAgent}
          onSave={saveAgents}
        />

        {/* Activity slide-out panel */}
        {showActivity && (
          <div className="fixed inset-0 z-30 pointer-events-none">
            {/* Backdrop - only on mobile */}
            <div
              className="absolute inset-0 bg-black/30 md:hidden pointer-events-auto"
              onClick={() => setShowActivity(false)}
            />
            {/* Panel */}
            <div className={`absolute top-0 right-0 h-full bg-white border-l border-gray-200 shadow-xl pointer-events-auto transition-all duration-300 ${
              pinnedActivity ? 'w-80' : 'w-72'
            } max-md:w-full`}>
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <h3 className="font-semibold text-sm">活动日志</h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPinnedActivity(!pinnedActivity)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      pinnedActivity ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600'
                    }`}
                    title={pinnedActivity ? '取消固定' : '固定'}
                  >
                    {pinnedActivity ? '已固定' : '固定'}
                  </button>
                  <button
                    onClick={() => setShowActivity(false)}
                    className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto p-4" style={{ height: 'calc(100vh - 60px)' }}>
                <ActivityFeed projectId={id} limit={50} />
              </div>
            </div>
          </div>
        )}

        {/* Static Activity Feed (hidden when panel is open) */}
        {!showActivity && (
          <div className="mt-8">
            <div className="card p-5">
              <h3 className="section-title mb-4">最近活动</h3>
              <ActivityFeed projectId={id} limit={20} />
            </div>
          </div>
        )}
      </div>

      <KeyboardShortcuts
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
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
