'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { DetailSkeleton } from '@/components/ui/SkeletonLoader';
import ActivityFeed from '@/components/activities/ActivityFeed';
import { KeyboardShortcuts } from '@/components/ui/KeyboardShortcuts';
import { StageTimeline } from './StageTimeline';
import { AgentAssignmentPanel } from './AgentAssignmentPanel';
import { IssueCard } from './IssueCard';
import type { WorkspaceAgent } from './types';

interface IssueStage {
  id: string;
  step: number;
  name: string;
  status: string;
}

interface Issue {
  id: string;
  projectId: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedAgentId: string | null;
  assignedAgentName?: string | null;
  stages: IssueStage[];
  createdAt: string;
  updatedAt: string;
}

interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
  status: string;
  issueCount: number;
  progress: number;
}

const COLUMNS = [
  { key: 'backlog', label: '待规划', color: 'bg-gray-50 border-gray-200' },
  { key: 'in_progress', label: '进行中', color: 'bg-blue-50 border-blue-200' },
  { key: 'in_review', label: '评审中', color: 'bg-yellow-50 border-yellow-200' },
  { key: 'done', label: '已完成', color: 'bg-green-50 border-green-200' },
];

export default function ProjectDetailPage() {
  const routeParams = useParams();
  const router = useRouter();
  const slug = routeParams.slug as string;
  const id = routeParams.id as string;

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [pinnedActivity, setPinnedActivity] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [draggingIssueId, setDraggingIssueId] = useState<string | null>(null);
  const [showAgentAssign, setShowAgentAssign] = useState(false);
  const [workspaceAgents, setWorkspaceAgents] = useState<WorkspaceAgent[]>([]);
  const [savingAgents, setSavingAgents] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  // Socket.io real-time updates
  useEffect(() => {
    const socket: Socket = io({ transports: ['websocket', 'polling'] });
    socket.emit('subscribe:project', id);

    socket.on('stage_update', () => {
      fetchIssues();
    });

    socket.on('comment', () => {
      // Handled in issue detail; no-op at kanban level
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
        setShowShortcuts((prev) => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function fetchData() {
    const [projRes, issuesRes] = await Promise.all([
      fetch(`/api/projects/${id}`),
      fetch(`/api/projects/${id}/issues`),
    ]);
    if (projRes.ok) {
      const data = await projRes.json();
      setProject(data);
    }
    if (issuesRes.ok) {
      setIssues(await issuesRes.json());
    }
    setLoading(false);
  }

  async function fetchIssues() {
    const res = await fetch(`/api/projects/${id}/issues`);
    if (res.ok) setIssues(await res.json());
  }

  async function updateIssueStatus(issueId: string, newStatus: string) {
    // Optimistic update
    const prev = [...issues];
    setIssues(issues.map((i) => (i.id === issueId ? { ...i, status: newStatus } : i)));
    try {
      await fetch(`/api/issues/${issueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      setIssues(prev);
      toast.error('状态更新失败');
    }
  }

  function handleDragStart(e: React.DragEvent, issueId: string) {
    e.dataTransfer.setData('text/plain', issueId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingIssueId(issueId);
  }

  function handleDragEnd() {
    setDraggingIssueId(null);
    setDragOverColumn(null);
  }

  function handleDragOver(e: React.DragEvent, columnKey: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== columnKey) setDragOverColumn(columnKey);
  }

  function handleDragLeave(e: React.DragEvent) {
    if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as HTMLElement)) return;
    setDragOverColumn(null);
  }

  function handleDrop(e: React.DragEvent, targetStatus: string) {
    e.preventDefault();
    const issueId = e.dataTransfer.getData('text/plain');
    if (!issueId) return;
    const issue = issues.find((i) => i.id === issueId);
    if (issue && issue.status !== targetStatus) {
      updateIssueStatus(issueId, targetStatus);
    }
    setDragOverColumn(null);
    setDraggingIssueId(null);
  }

  function issuesByStatus(status: string) {
    return issues.filter((i) => i.status === status);
  }

  async function handleDelete() {
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    toast.success('项目已删除');
    router.push(`/workspaces/${slug}/projects`);
  }

  async function handleArchive() {
    await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    });
    toast.success('项目已归档');
    fetchData();
  }

  async function handleUnarchive() {
    await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    toast.success('项目已恢复');
    fetchData();
  }

  async function loadAgents() {
    const res = await fetch(`/api/projects/${id}/agents`);
    setWorkspaceAgents(await res.json());
    setShowAgentAssign(true);
  }

  async function saveAgents() {
    setSavingAgents(true);
    const agentIds = workspaceAgents.filter((a) => a.assigned).map((a) => a.id);
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
    setWorkspaceAgents((prev) =>
      prev.map((a) => (a.id === agentId ? { ...a, assigned: !a.assigned } : a))
    );
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

  // Compute overall progress from all issue stages
  const allStages = issues.flatMap((i) => i.stages || []);
  const totalStages = allStages.length;
  const completedStages = allStages.filter((s) => s.status === 'completed').length;
  const progress = totalStages ? Math.round((completedStages / totalStages) * 100) : 0;

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
              className={`h-2.5 rounded-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-blue-600'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-sm font-medium">{progress}%</span>
          <span className="text-xs text-gray-400">{issues.length} 个 Issue</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pb-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/workspaces/${slug}/projects/${id}/issues/new`)}
              className="btn-primary btn-sm inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              提 Issue
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
            <button
              onClick={() => setShowActivity(!showActivity)}
              className={`btn btn-sm ${showActivity ? 'bg-blue-100 text-blue-700' : 'btn-ghost'}`}
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

        {/* Kanban board */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const colIssues = issuesByStatus(col.key);
            const isDragOver = dragOverColumn === col.key;
            return (
              <div
                key={col.key}
                className={`rounded-lg border ${col.color} p-3 min-h-[200px] transition-colors ${
                  isDragOver ? 'ring-2 ring-blue-400 bg-blue-50/50' : ''
                }`}
                onDragOver={(e) => handleDragOver(e, col.key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.key)}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">{col.label}</h3>
                  <span className="text-xs text-gray-400 bg-white/80 rounded-full px-2 py-0.5">
                    {colIssues.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {colIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      slug={slug}
                      projectId={id}
                      onDragStart={handleDragStart}
                    />
                  ))}
                  {colIssues.length === 0 && (
                    <div className="text-center py-8 text-xs text-gray-400">
                      {isDragOver ? '放置到此处' : '暂无 Issue'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Agent Assignment */}
        <AgentAssignmentPanel
          show={showAgentAssign}
          agents={workspaceAgents}
          saving={savingAgents}
          onToggle={() => (showAgentAssign ? setShowAgentAssign(false) : loadAgents())}
          onAgentToggle={toggleAgent}
          onSave={saveAgents}
        />

        {/* Activity slide-out panel */}
        {showActivity && (
          <div className="fixed inset-0 z-30 pointer-events-none">
            <div
              className="absolute inset-0 bg-black/30 md:hidden pointer-events-auto"
              onClick={() => setShowActivity(false)}
            />
            <div
              className={`absolute top-0 right-0 h-full bg-white border-l border-gray-200 shadow-xl pointer-events-auto transition-all duration-300 ${
                pinnedActivity ? 'w-80' : 'w-72'
              } max-md:w-full`}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <h3 className="font-semibold text-sm">活动日志</h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPinnedActivity(!pinnedActivity)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      pinnedActivity ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-gray-600'
                    }`}
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

        {/* Static Activity Feed */}
        {!showActivity && (
          <div className="mt-8">
            <div className="card p-5">
              <h3 className="section-title mb-4">最近活动</h3>
              <ActivityFeed projectId={id} limit={20} />
            </div>
          </div>
        )}
      </div>

      <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <ConfirmModal
        open={confirmDelete}
        title="删除项目"
        message="确定删除此项目？所有关联的 Issue、任务和文档将被删除。此操作不可撤销。"
        confirmLabel="删除"
        variant="danger"
        onConfirm={() => {
          setConfirmDelete(false);
          handleDelete();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
