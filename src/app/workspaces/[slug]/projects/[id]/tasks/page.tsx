'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { ListSkeleton } from '@/components/ui/SkeletonLoader';
import { OnboardingTooltip } from '@/components/ui/OnboardingTooltip';

interface StageInfo {
  id: string;
  step: number;
  name: string;
  status: string;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedTo: string | null;
  stageId: string | null;
  stageInfo: StageInfo | null;
  agentId: string | null;
  gitBranch: string | null;
  githubIssueId: string | null;
  createdAt: string;
}

const COLUMNS: Array<{ key: string; label: string; color: string }> = [
  { key: 'todo', label: '待办', color: 'bg-gray-100' },
  { key: 'in_progress', label: '进行中', color: 'bg-blue-100' },
  { key: 'in_review', label: '评审中', color: 'bg-yellow-100' },
  { key: 'done', label: '已完成', color: 'bg-green-100' },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: 'badge-gray',
  medium: 'badge-primary',
  high: 'badge-orange',
  critical: 'badge-error',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '紧急',
};

export default function TasksPage() {
  const routeParams = useParams();
  const slug = routeParams.slug as string;
  const projectId = routeParams.id as string;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newStageId, setNewStageId] = useState('');
  const [stages, setStages] = useState<StageInfo[]>([]);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [mobileColumn, setMobileColumn] = useState('todo');

  useEffect(() => { fetchTasks(); fetchStages(); }, [projectId]);

  async function fetchTasks() {
    const res = await fetch(`/api/projects/${projectId}/tasks`);
    setTasks(await res.json());
    setLoading(false);
  }

  async function fetchStages() {
    const res = await fetch(`/api/projects/${projectId}`);
    const data = await res.json();
    const stageList = data.stages || [];
    setStages(stageList);
    const firstActive = stageList.find((s: StageInfo) => s.status === 'in_progress' || s.status === 'pending');
    if (firstActive) setNewStageId(firstActive.id);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, description: newDesc, priority: newPriority, stageId: newStageId || null }),
    });
    if (res.ok) {
      setShowNew(false);
      setNewTitle('');
      setNewDesc('');
      setNewStageId('');
      fetchTasks();
    }
    setSaving(false);
  }

  async function updateTaskStatus(taskId: string, newStatus: string) {
    // Optimistic update
    const prevTasks = [...tasks];
    setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      setTasks(prevTasks);
      toast.error('状态更新失败');
    }
  }

  function handleDragStart(e: React.DragEvent, taskId: string) {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingTaskId(taskId);
  }

  function handleDragEnd() {
    setDraggingTaskId(null);
    setDragOverColumn(null);
  }

  function handleDragOver(e: React.DragEvent, columnKey: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== columnKey) {
      setDragOverColumn(columnKey);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear if leaving the column itself (not children)
    if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as HTMLElement)) return;
    setDragOverColumn(null);
  }

  function handleDrop(e: React.DragEvent, targetStatus: string) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    if (task && task.status !== targetStatus) {
      updateTaskStatus(taskId, targetStatus);
    }
    setDragOverColumn(null);
    setDraggingTaskId(null);
  }

  async function handleDelete(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    toast.success('任务已删除');
    fetchTasks();
  }

  function tasksByStatus(status: string) {
    return tasks.filter(t => t.status === status);
  }

  return (
    <>
      <div className="px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">任务看板</h1>
        <button
          onClick={() => setShowNew(!showNew)}
          className="btn-primary"
        >
          {showNew ? '取消' : '新建任务'}
        </button>
      </div>

      <main className="p-6">
        {showNew && (
          <form onSubmit={handleCreate} className="max-w-2xl mx-auto mb-6 card p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">任务标题</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="input"
                placeholder="任务描述"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">详细说明（可选）</label>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="input"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">优先级</label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                className="select"
              >
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            {stages.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">所属阶段</label>
                <select
                  value={newStageId}
                  onChange={(e) => setNewStageId(e.target.value)}
                  className="select"
                >
                  <option value="">不关联阶段</option>
                  {stages.map(s => (
                    <option key={s.id} value={s.id}>
                      {String(s.step).padStart(2, '0')} - {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
            >
              {saving ? '创建中...' : '创建任务'}
            </button>
          </form>
        )}

        {loading ? (
          <ListSkeleton count={5} />
        ) : (
          <>
            {/* Mobile column tabs */}
            <div className="flex gap-1 overflow-x-auto pb-2 md:hidden">
              {COLUMNS.map(col => (
                <button
                  key={col.key}
                  onClick={() => setMobileColumn(col.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    mobileColumn === col.key
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {col.label} ({tasksByStatus(col.key).length})
                </button>
              ))}
            </div>

            {/* Desktop: 4-column grid */}
            <div className="hidden md:grid grid-cols-4 gap-4" style={{ minHeight: '60vh' }}>
              {COLUMNS.map((col, idx) => {
                const column = (
                  <KanbanColumn
                    col={col}
                    tasks={tasksByStatus(col.key)}
                    slug={slug}
                    projectId={projectId}
                    dragOverColumn={dragOverColumn}
                    draggingTaskId={draggingTaskId}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onUpdateStatus={updateTaskStatus}
                    onDeleteClick={setConfirmDeleteTask}
                  />
                );
                if (idx === 0) {
                  return (
                    <OnboardingTooltip
                      key={col.key}
                      id="kanban-drag-drop"
                      title="拖拽操作"
                      description="你可以拖拽任务卡片到不同列来更改状态，也可以使用卡片底部的下拉菜单切换状态。"
                      position="right"
                    >
                      {column}
                    </OnboardingTooltip>
                  );
                }
                return <div key={col.key}>{column}</div>;
              })}
            </div>

            {/* Mobile: single column */}
            <div className="md:hidden" style={{ minHeight: '60vh' }}>
              {COLUMNS.filter(c => c.key === mobileColumn).map(col => (
                <KanbanColumn
                  key={col.key}
                  col={col}
                  tasks={tasksByStatus(col.key)}
                  slug={slug}
                  projectId={projectId}
                  dragOverColumn={dragOverColumn}
                  draggingTaskId={draggingTaskId}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onUpdateStatus={updateTaskStatus}
                  onDeleteClick={setConfirmDeleteTask}
                />
              ))}
            </div>
          </>
        )}
      </main>
      <ConfirmModal
        open={confirmDeleteTask !== null}
        title="删除任务"
        message="确定删除此任务？"
        confirmLabel="删除"
        variant="danger"
        onConfirm={() => { const id = confirmDeleteTask!; setConfirmDeleteTask(null); handleDelete(id); }}
        onCancel={() => setConfirmDeleteTask(null)}
      />
    </>
  );
}

function KanbanColumn({ col, tasks: columnTasks, slug, projectId, dragOverColumn, draggingTaskId, onDragOver, onDragLeave, onDrop, onDragStart, onDragEnd, onUpdateStatus, onDeleteClick }: {
  col: { key: string; label: string; color: string };
  tasks: Task[];
  slug: string;
  projectId: string;
  dragOverColumn: string | null;
  draggingTaskId: string | null;
  onDragOver: (e: React.DragEvent, key: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: string) => void;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDragEnd: () => void;
  onUpdateStatus: (taskId: string, status: string) => void;
  onDeleteClick: (taskId: string) => void;
}) {
  return (
    <div
      className={`${col.color} rounded-xl p-3 transition-all
        ${dragOverColumn === col.key ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`}
      onDragOver={(e) => onDragOver(e, col.key)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, col.key)}
    >
      <div className="flex items-center justify-between mb-3 px-2">
        <h3 className="font-semibold text-sm">{col.label}</h3>
        <span className="text-xs text-gray-500">{columnTasks.length}</span>
      </div>
      <div className="space-y-2">
        {columnTasks.map(task => (
          <div
            key={task.id}
            draggable
            onDragStart={(e) => onDragStart(e, task.id)}
            onDragEnd={onDragEnd}
            className={`bg-white rounded-lg p-3 shadow-sm border border-gray-100 transition-all
              ${draggingTaskId === task.id ? 'opacity-50 scale-95' : ''}
              cursor-grab active:cursor-grabbing hover:shadow-md`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1">
                <GripVertical size={14} className="text-gray-300 shrink-0 mt-0.5" />
                <Link
                  href={`/workspaces/${slug}/projects/${projectId}/tasks/${task.id}`}
                  className="font-medium text-sm hover:text-blue-600"
                >
                  {task.title}
                </Link>
              </div>
              <button
                onClick={() => onDeleteClick(task.id)}
                className="text-gray-300 hover:text-red-500 text-xs shrink-0"
              >
                ✕
              </button>
            </div>
            {task.description && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={PRIORITY_COLORS[task.priority] || 'badge-gray'}>
                {PRIORITY_LABELS[task.priority] || task.priority}
              </span>
              {task.stageInfo && (
                <span className="badge-purple">
                  {String(task.stageInfo.step).padStart(2, '0')} {task.stageInfo.name}
                </span>
              )}
              {task.githubIssueId && (
                <span className="badge-purple">#{task.githubIssueId}</span>
              )}
              <div className="flex-1" />
              <select
                value={task.status}
                onChange={(e) => onUpdateStatus(task.id, e.target.value)}
                className="text-xs border border-gray-200 rounded px-1 py-0.5"
              >
                {COLUMNS.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {columnTasks.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">暂无任务</p>
        )}
      </div>
    </div>
  );
}
