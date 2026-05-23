'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AgentRunner from '@/components/agents/AgentRunner';

interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedTo: string | null;
  stageId: string | null;
  agentId: string | null;
  repositoryId: string | null;
  gitBranch: string | null;
  gitCommitSha: string | null;
  githubIssueId: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  todo: '待办', in_progress: '进行中', in_review: '评审中', done: '已完成',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: '低', medium: '中', high: '高', critical: '紧急',
};

export default function TaskDetailPage() {
  const routeParams = useParams();
  const router = useRouter();
  const slug = routeParams.slug as string;
  const projectId = routeParams.id as string;
  const taskId = routeParams.taskId as string;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [saving, setSaving] = useState(false);
  const [showRunner, setShowRunner] = useState(false);

  useEffect(() => {
    fetch(`/api/tasks/${taskId}`)
      .then(r => r.json())
      .then(data => {
        setTask(data);
        setTitle(data.title);
        setDescription(data.description || '');
        setPriority(data.priority);
        setLoading(false);
      });
  }, [taskId]);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, priority }),
    });
    if (res.ok) {
      setTask({ ...task!, title, description, priority, updatedAt: new Date().toISOString() });
      setEditing(false);
    }
    setSaving(false);
  }

  async function handleStatusChange(newStatus: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    setTask({ ...task!, status: newStatus });
  }

  async function handleDelete() {
    if (!confirm('确定删除此任务？')) return;
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    router.push(`/workspaces/${slug}/projects/${projectId}/tasks`);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">加载中...</p></div>;
  if (!task) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">任务未找到</p></div>;

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/workspaces/${slug}/projects/${projectId}/tasks`} className="text-gray-500 hover:text-gray-700">&larr; 任务看板</Link>
          {editing ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-xl font-bold px-2 py-1 border border-gray-300 rounded"
            />
          ) : (
            <h1 className="text-xl font-bold">{task.title}</h1>
          )}
          <span className={`text-xs px-2 py-0.5 rounded ${
            task.status === 'done' ? 'bg-green-100 text-green-700' :
            task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
            task.status === 'in_review' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {STATUS_LABELS[task.status]}
          </span>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs hover:bg-blue-700 disabled:opacity-50">
                {saving ? '保存中...' : '保存'}
              </button>
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50">取消</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs hover:bg-blue-700">编辑</button>
          )}
          <button onClick={handleDelete} className="px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-50">删除</button>
          {task.agentId && (
            <button
              onClick={() => setShowRunner(!showRunner)}
              className="px-3 py-1.5 text-xs bg-gray-900 text-green-400 rounded-lg hover:bg-gray-800 font-mono"
            >
              {showRunner ? '收起执行器' : '▶ 执行 Agent'}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
          {/* Status transitions */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">状态</h3>
            <div className="flex gap-2">
              {[
                { key: 'todo', label: '待办' },
                { key: 'in_progress', label: '进行中' },
                { key: 'in_review', label: '评审中' },
                { key: 'done', label: '已完成' },
              ].map(s => (
                <button
                  key={s.key}
                  onClick={() => handleStatusChange(s.key)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    task.status === s.key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">优先级</h3>
            {editing ? (
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="text-sm border border-gray-300 rounded px-2 py-1">
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            ) : (
              <p className="text-sm">{PRIORITY_LABELS[task.priority]}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">描述</h3>
            {editing ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                rows={6}
                placeholder="任务详细说明..."
              />
            ) : (
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{task.description || '暂无描述'}</p>
            )}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {task.gitBranch && (
              <div>
                <span className="text-gray-500">分支：</span>
                <code className="bg-gray-100 px-1 rounded">{task.gitBranch}</code>
              </div>
            )}
            {task.gitCommitSha && (
              <div>
                <span className="text-gray-500">Commit：</span>
                <code className="bg-gray-100 px-1 rounded">{task.gitCommitSha.slice(0, 8)}</code>
              </div>
            )}
            {task.githubIssueId && (
              <div>
                <span className="text-gray-500">GitHub Issue：</span>
                <span>#{task.githubIssueId}</span>
              </div>
            )}
            <div>
              <span className="text-gray-500">创建时间：</span>
              <span>{new Date(task.createdAt).toLocaleString('zh-CN')}</span>
            </div>
            <div>
              <span className="text-gray-500">更新时间：</span>
              <span>{new Date(task.updatedAt).toLocaleString('zh-CN')}</span>
            </div>
          </div>
        </div>

        {showRunner && task.agentId && (
          <div className="mt-6">
            <AgentRunner
              agentId={task.agentId}
              agentName={`Agent-${task.agentId.slice(0, 8)}`}
              projectId={projectId}
              taskId={taskId}
              onClose={() => setShowRunner(false)}
            />
          </div>
        )}
      </main>
    </div>
  );
}
