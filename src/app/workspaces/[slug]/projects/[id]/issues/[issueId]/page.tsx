'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { ArrowLeft, Bug, Lightbulb, Rocket } from 'lucide-react';
import { DetailSkeleton } from '@/components/ui/SkeletonLoader';
import ActivityFeed from '@/components/activities/ActivityFeed';
import { StageCard } from '../../StageCard';
import { StageTimeline } from '../../StageTimeline';
import type { Comment, Stage } from '../../types';

interface IssueDetail {
  id: string;
  projectId: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedAgentId: string | null;
  assignedAgentName?: string | null;
  stages: Stage[];
  progress: number;
  totalStages: number;
  doneStages: number;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  feature: <Rocket className="w-4 h-4" />,
  bug: <Bug className="w-4 h-4" />,
  improvement: <Lightbulb className="w-4 h-4" />,
};

const TYPE_COLORS: Record<string, string> = {
  feature: 'text-blue-600 bg-blue-50',
  bug: 'text-red-600 bg-red-50',
  improvement: 'text-purple-600 bg-purple-50',
};

const TYPE_LABELS: Record<string, string> = {
  feature: '功能',
  bug: 'Bug',
  improvement: '改进',
};

const STATUS_LABELS: Record<string, string> = {
  backlog: '待规划',
  in_progress: '进行中',
  in_review: '评审中',
  done: '已完成',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '紧急',
};

export default function IssueDetailPage() {
  const routeParams = useParams();
  const router = useRouter();
  const slug = routeParams.slug as string;
  const projectId = routeParams.id as string;
  const issueId = routeParams.issueId as string;

  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<number | null>(null);
  const [assigning, setAssigning] = useState<number | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [showReject, setShowReject] = useState<number | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchIssue();
  }, [issueId]);

  // Socket.io
  useEffect(() => {
    const socket: Socket = io({ transports: ['websocket', 'polling'] });
    socket.emit('subscribe:project', projectId);

    socket.on('stage_update', (data: { issueId: string; step: number; status: string; reviewNotes: string }) => {
      if (data.issueId !== issueId) return;
      setIssue((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          stages: prev.stages.map((s) =>
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

    return () => {
      socket.emit('unsubscribe:project', projectId);
      socket.disconnect();
    };
  }, [issueId, projectId]);

  async function fetchIssue() {
    const res = await fetch(`/api/issues/${issueId}`);
    if (res.ok) {
      setIssue(await res.json());
    }
    setLoading(false);
  }

  async function handleApprove(step: number) {
    if (!issue) return;
    const prevStages = [...issue.stages];
    setIssue({ ...issue, stages: issue.stages.map((s) => (s.step === step ? { ...s, status: 'completed', completedAt: new Date().toISOString() } : s)) });
    setActing(step);
    try {
      await fetch(`/api/issues/${issueId}/stages/${step}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      toast.success(`阶段 ${step} 已通过`);
    } catch {
      setIssue({ ...issue, stages: prevStages });
      toast.error('操作失败，请重试');
    } finally {
      setActing(null);
      fetchIssue();
    }
  }

  async function handleReject(step: number) {
    if (!issue) return;
    const prevStages = [...issue.stages];
    setIssue({ ...issue, stages: issue.stages.map((s) => (s.step === step ? { ...s, status: 'rejected', reviewNotes: rejectNotes } : s)) });
    setShowReject(null);
    setActing(step);
    try {
      await fetch(`/api/issues/${issueId}/stages/${step}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reviewNotes: rejectNotes }),
      });
      toast.success(`阶段 ${step} 已驳回`);
    } catch {
      setIssue({ ...issue, stages: prevStages });
      toast.error('操作失败，请重试');
    } finally {
      setActing(null);
      setRejectNotes('');
      fetchIssue();
    }
  }

  async function handleAutoAssign(step: number) {
    setAssigning(step);
    try {
      await fetch(`/api/issues/${issueId}/stages/auto-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step }),
      });
      toast.success(`阶段 ${step} 已自动分配`);
    } catch {
      toast.error('分配失败');
    } finally {
      setAssigning(null);
      fetchIssue();
    }
  }

  async function toggleComments(stageId: string) {
    const next = new Set(expandedComments);
    if (next.has(stageId)) {
      next.delete(stageId);
    } else {
      next.add(stageId);
      if (!comments[stageId]) {
        const res = await fetch(`/api/projects/${projectId}/comments?stageId=${stageId}`);
        const data = await res.json();
        setComments((prev) => ({ ...prev, [stageId]: data }));
      }
    }
    setExpandedComments(next);
  }

  async function handlePostComment(stageId: string) {
    const text = commentText[stageId];
    if (!text?.trim()) return;
    setSubmittingComment((prev) => ({ ...prev, [stageId]: true }));
    const tempId = `temp-${Date.now()}`;
    const optimistic: Comment = { id: tempId, userId: '', userName: null, content: text, stageId, createdAt: new Date().toISOString() };
    setComments((prev) => ({ ...prev, [stageId]: [optimistic, ...(prev[stageId] || [])] }));
    setCommentText((prev) => ({ ...prev, [stageId]: '' }));
    try {
      await fetch(`/api/projects/${projectId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, stageId }),
      });
      const res = await fetch(`/api/projects/${projectId}/comments?stageId=${stageId}`);
      const data = await res.json();
      setComments((prev) => ({ ...prev, [stageId]: data }));
    } catch {
      setComments((prev) => ({ ...prev, [stageId]: (prev[stageId] || []).filter((c) => c.id !== tempId) }));
      toast.error('评论发送失败');
    } finally {
      setSubmittingComment((prev) => ({ ...prev, [stageId]: false }));
    }
  }

  async function handleRoleChange(step: number, requiredRole: string) {
    if (!issue) return;
    const prevStages = [...issue.stages];
    setIssue({ ...issue, stages: issue.stages.map((s) => (s.step === step ? { ...s, requiredRole } : s)) });
    try {
      await fetch(`/api/issues/${issueId}/stages/${step}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requiredRole }),
      });
      toast.success('角色已更新');
    } catch {
      setIssue({ ...issue, stages: prevStages });
      toast.error('更新失败');
    }
  }

  async function handleDeleteIssue() {
    await fetch(`/api/issues/${issueId}`, { method: 'DELETE' });
    toast.success('Issue 已删除');
    router.push(`/workspaces/${slug}/projects/${projectId}`);
  }

  // ── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <DetailSkeleton />
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Issue 未找到</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 pb-6">
      {/* Header */}
      <div className="py-4 space-y-3">
        <button
          onClick={() => router.push(`/workspaces/${slug}/projects/${projectId}`)}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回看板
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[issue.type] || 'text-gray-600 bg-gray-100'}`}>
                {TYPE_ICONS[issue.type] || null}
                {TYPE_LABELS[issue.type] || issue.type}
              </span>
              <span className={`badge text-xs ${issue.priority === 'critical' ? 'badge-error' : issue.priority === 'high' ? 'badge-orange' : issue.priority === 'low' ? 'badge-gray' : 'badge-primary'}`}>
                {PRIORITY_LABELS[issue.priority] || issue.priority}
              </span>
              <span className="badge badge-gray text-xs">{STATUS_LABELS[issue.status] || issue.status}</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">{issue.title}</h1>
            {issue.description && (
              <p className="text-sm text-gray-500 max-w-2xl">{issue.description}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span>{issue.totalStages} 个阶段</span>
              <span>{issue.doneStages} / {issue.totalStages} 已完成</span>
              {issue.assignedAgentName && <span>负责人: {issue.assignedAgentName}</span>}
            </div>
          </div>
          <button onClick={handleDeleteIssue} className="btn btn-danger btn-sm">删除 Issue</button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${issue.progress === 100 ? 'bg-green-500' : 'bg-blue-600'}`}
              style={{ width: `${issue.progress}%` }}
            />
          </div>
          <span className="text-sm font-medium">{issue.progress}%</span>
        </div>
      </div>

      {/* Stage timeline */}
      <div className="mb-6">
        <StageTimeline
          stages={issue.stages}
          onSelectStage={(step) => {
            document.getElementById(`stage-${step}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        />
      </div>

      {/* Stage cards */}
      <div className="space-y-3">
        {issue.stages.map((stage) => (
          <StageCard
            key={stage.id}
            stage={stage}
            projectId={projectId}
            isHidden={false}
            acting={acting}
            assigning={assigning}
            showReject={showReject}
            editingRole={null}
            rejectNotes={rejectNotes}
            expandedComments={expandedComments}
            comments={comments}
            commentText={commentText}
            submittingComment={submittingComment}
            latestDeployment={null}
            recentFeedback={[]}
            deployVersion=""
            deploying={false}
            feedbackType="feedback"
            feedbackTitle=""
            feedbackSeverity="medium"
            submittingFeedback={false}
            onApprove={handleApprove}
            onReject={handleReject}
            onAutoAssign={handleAutoAssign}
            onRoleChange={handleRoleChange}
            onSetEditingRole={() => {}}
            onSetShowReject={setShowReject}
            onRejectNotesChange={setRejectNotes}
            onToggleComments={toggleComments}
            onCommentTextChange={(stageId, text) => setCommentText((prev) => ({ ...prev, [stageId]: text }))}
            onPostComment={handlePostComment}
            onDeployVersionChange={() => {}}
            onDeploy={() => {}}
            onFeedbackTypeChange={() => {}}
            onFeedbackTitleChange={() => {}}
            onFeedbackSeverityChange={() => {}}
            onFeedbackSubmit={() => {}}
          />
        ))}
      </div>

      {/* Activity feed */}
      <div className="mt-8">
        <div className="card p-5">
          <h3 className="section-title mb-4">活动日志</h3>
          <ActivityFeed projectId={projectId} limit={30} />
        </div>
      </div>
    </div>
  );
}
