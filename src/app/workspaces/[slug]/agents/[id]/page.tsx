'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AgentRunner from '@/components/agents/AgentRunner';
import { ROLE_LABELS, STAGE_NAMES } from '@/types';
import { AGENT_TYPES } from '@/lib/agents';
import PermissionSelector from '@/components/agents/PermissionSelector';
import { getDefaultPermissions, PERMISSIONS, ROLE_BADGES, type Role } from '@/lib/permissions';

const PERM_LABEL_MAP: Record<string, string> = Object.fromEntries(
  PERMISSIONS.flatMap(area => area.items.map(item => [item.id, item.label]))
);

const ROLE_OPTIONS = Object.entries(ROLE_LABELS)
  .filter(([key]) => key !== 'admin')
  .map(([key, label]) => ({ value: key, label }));


interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  projectId: string;
  projectName: string | null;
  stageId: string | null;
  stageInfo: { step: number; name: string } | null;
  gitBranch: string | null;
  gitCommitSha: string | null;
  updatedAt: string;
}

interface Activity {
  id: string;
  action: string;
  target: string | null;
  projectId: string | null;
  createdAt: string;
}

interface AgentDetail {
  id: string;
  type: string;
  name: string;
  role: string;
  execPath: string | null;
  argsTemplate: string | null;
  enabled: boolean;
  gitName: string | null;
  gitEmail: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  todo: '待办', in_progress: '进行中', in_review: '评审中', done: '已完成',
};

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  in_review: 'bg-yellow-100 text-yellow-700',
  done: 'bg-green-100 text-green-700',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: '低', medium: '中', high: '高', critical: '紧急',
};

const ACTION_LABELS: Record<string, string> = {
  agent_execution_started: '开始执行',
  agent_execution_completed: '执行完成',
  stage_approved: '阶段通过',
  stage_rejected: '阶段驳回',
  pr_created: 'PR 创建',
  deployment_started: '开始部署',
  deployment_completed: '部署完成',
};

export default function AgentDetailPage() {
  const routeParams = useParams();
  const router = useRouter();
  const slug = routeParams.slug as string;
  const agentId = routeParams.id as string;

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [showRunnerForTask, setShowRunnerForTask] = useState<string | null>(null);
  const [showProjects, setShowProjects] = useState(false);
  const [projectAssignments, setProjectAssignments] = useState<Array<{ id: string; name: string; status: string; assigned: boolean }>>([]);
  const [savingProjects, setSavingProjects] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editExecPath, setEditExecPath] = useState('');
  const [editArgsTemplate, setEditArgsTemplate] = useState('');
  const [editEnvVars, setEditEnvVars] = useState('');
  const [editGitName, setEditGitName] = useState('');
  const [editGitEmail, setEditGitEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/workspaces/${slug}/agents/${agentId}`)
      .then(r => r.json())
      .then(data => {
        setAgent(data);
        setTasks(data.tasks || []);
        setActivities(data.recentActivities || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug, agentId]);

  async function handleToggle(enabled: boolean) {
    await fetch(`/api/agents/${agentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setAgent(agent ? { ...agent, enabled: !enabled } : null);
  }

  const todoTasks = tasks.filter(t => t.status === 'todo' || t.status === 'in_progress');
  const doneTasks = tasks.filter(t => t.status === 'done' || t.status === 'in_review');

  function startEditing() {
    if (!agent) return;
    setEditName(agent.name);
    setEditRole(agent.role);
    setEditExecPath(agent.execPath || '');
    setEditArgsTemplate(agent.argsTemplate || '');
    setEditEnvVars('');
    setEditGitName(agent.gitName || '');
    setEditGitEmail(agent.gitEmail || '');
    setEditing(true);
  }

  async function handleSave() {
    if (!agent) return;
    setSaving(true);
    const body: Record<string, unknown> = {
      name: editName,
      role: editRole,
      execPath: editExecPath || null,
      argsTemplate: editArgsTemplate || null,
      gitName: editGitName || null,
      gitEmail: editGitEmail || null,
    };
    if (editEnvVars) {
      try { body.envVars = JSON.parse(editEnvVars); } catch { body.envVars = editEnvVars; }
    } else {
      body.envVars = null;
    }
    await fetch(`/api/agents/${agentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setAgent({ ...agent, name: editName, role: editRole, execPath: editExecPath || null, argsTemplate: editArgsTemplate || null, gitName: editGitName || null, gitEmail: editGitEmail || null });
    setSaving(false);
    setEditing(false);
  }

  function cancelEditing() {
    setEditing(false);
  }

  async function loadProjects() {
    const res = await fetch(`/api/workspaces/${slug}/agents/${agentId}/projects`);
    setProjectAssignments(await res.json());
    setShowProjects(true);
  }

  async function saveProjects() {
    setSavingProjects(true);
    const projectIds = projectAssignments.filter(p => p.assigned).map(p => p.id);
    await fetch(`/api/workspaces/${slug}/agents/${agentId}/projects`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectIds }),
    });
    setSavingProjects(false);
    setShowProjects(false);
  }

  if (loading) return <div className="p-6 text-gray-500">加载中...</div>;
  if (!agent) return <div className="p-6 text-gray-500">Agent 未找到</div>;

  return (
    <div>
      <div className="px-6 py-4 flex items-center gap-4">
        <Link href={`/workspaces/${slug}/agents`} className="text-gray-500 hover:text-gray-700">&larr; Agent 列表</Link>
        <h1 className="text-lg font-bold">{agent.name}</h1>
      </div>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Agent info card */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          {editing ? (
            /* Edit form */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">编辑 Agent</h3>
                <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">{agent.type}</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                <input
                  type="text" value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                >
                  {ROLE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <label className="block text-xs font-medium text-gray-500 mb-1">权限配置</label>
                <PermissionSelector role={editRole as Role} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CLI 路径</label>
                <input
                  type="text" value={editExecPath}
                  onChange={(e) => setEditExecPath(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">参数模板</label>
                <input
                  type="text" value={editArgsTemplate}
                  onChange={(e) => setEditArgsTemplate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
              </div>

              <fieldset className="border border-gray-200 rounded-lg p-4">
                <legend className="text-sm font-medium text-gray-700 px-1">Git 配置</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">用户名</label>
                    <input
                      type="text" value={editGitName}
                      onChange={(e) => setEditGitName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">邮箱</label>
                    <input
                      type="email" value={editGitEmail}
                      onChange={(e) => setEditGitEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
              </fieldset>

              <div className="flex gap-3">
                <button
                  onClick={cancelEditing}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          ) : (
            /* Read-only display */
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <h2 className="font-semibold text-lg">{agent.name}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">{agent.type}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                        {ROLE_LABELS[agent.role] || agent.role}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${agent.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <span className="text-xs text-gray-500">{agent.enabled ? '已启用' : '已禁用'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={startEditing}
                    className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleToggle(agent.enabled)}
                    className={`px-3 py-1.5 text-xs rounded-lg ${
                      agent.enabled
                        ? 'border border-red-300 text-red-600 hover:bg-red-50'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {agent.enabled ? '禁用' : '启用'}
                  </button>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-medium text-gray-500 mb-2">角色权限</h4>
                <div className="flex flex-wrap gap-1">
                  {getDefaultPermissions(agent.role as Role).map((permId) => (
                    <span key={permId} className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-xs border border-blue-100">
                      {PERM_LABEL_MAP[permId] || permId}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100 text-sm">
                <div>
                  <span className="text-gray-500">执行路径：</span>
                  <code className="bg-gray-100 px-1 rounded text-xs">{agent.execPath || '默认'}</code>
                </div>
                <div>
                  <span className="text-gray-500">角色：</span>
                  <span>{ROLE_LABELS[agent.role] || agent.role}</span>
                </div>
                {agent.gitName && (
                  <div>
                    <span className="text-gray-500">Git 用户：</span>
                    <span>{agent.gitName}{agent.gitEmail && ` <${agent.gitEmail}>`}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-500">创建于：</span>
                  <span>{new Date(agent.createdAt).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Project assignments */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <button
            onClick={() => showProjects ? setShowProjects(false) : loadProjects()}
            className="flex items-center justify-between w-full text-left"
          >
            <h3 className="font-semibold">项目分配</h3>
            <span className="text-xs text-gray-400">{showProjects ? '收起 ▲' : '展开 ▼'}</span>
          </button>

          {showProjects && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              {projectAssignments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">暂无项目</p>
              ) : (
                <div className="space-y-2">
                  {projectAssignments.map(p => (
                    <label
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={p.assigned}
                        onChange={() => setProjectAssignments(prev =>
                          prev.map(x => x.id === p.id ? { ...x, assigned: !x.assigned } : x)
                        )}
                        className="rounded"
                      />
                      <span className="font-medium text-sm flex-1">{p.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        p.status === 'active' ? 'bg-green-100 text-green-700' :
                        p.status === 'archived' ? 'bg-gray-100 text-gray-500' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {p.status}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={saveProjects}
                  disabled={savingProjects}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingProjects ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Task queue */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold mb-4">
            任务队列
            <span className="text-sm text-gray-400 font-normal ml-2">{todoTasks.length} 个待处理</span>
          </h3>

          {tasks.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">暂无分配的任务</p>
          ) : (
            <div className="space-y-2">
              {todoTasks.map(task => (
                <div key={task.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3 hover:bg-gray-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/workspaces/${slug}/projects/${task.projectId}/tasks/${task.id}`}
                        className="font-medium text-sm hover:text-blue-600 truncate"
                      >
                        {task.title}
                      </Link>
                      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${STATUS_COLORS[task.status]}`}>
                        {STATUS_LABELS[task.status]}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0">{PRIORITY_LABELS[task.priority]}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      {task.projectName && <span>{task.projectName}</span>}
                      {task.stageInfo && <span>阶段 {task.stageInfo.step}: {task.stageInfo.name}</span>}
                      {task.gitBranch && <code className="bg-gray-100 px-1 rounded">{task.gitBranch}</code>}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowRunnerForTask(showRunnerForTask === task.id ? null : task.id)}
                    className="ml-3 px-3 py-1.5 text-xs bg-gray-900 text-green-400 rounded-lg hover:bg-gray-800 font-mono shrink-0"
                  >
                    {showRunnerForTask === task.id ? '收起' : '▶ 执行'}
                  </button>
                </div>
              ))}

              {doneTasks.length > 0 && (
                <>
                  <p className="text-xs text-gray-400 pt-4 pb-2">已完成 / 评审中</p>
                  {doneTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-2 border border-gray-100 rounded-lg px-4 py-2 opacity-60">
                      <Link
                        href={`/workspaces/${slug}/projects/${task.projectId}/tasks/${task.id}`}
                        className="text-sm hover:text-blue-600 truncate flex-1"
                      >
                        {task.title}
                      </Link>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[task.status]}`}>
                        {STATUS_LABELS[task.status]}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Inline AgentRunner for selected task */}
        {showRunnerForTask && (
          <AgentRunner
            agentId={agent.id}
            agentName={agent.name}
            projectId={tasks.find(t => t.id === showRunnerForTask)?.projectId}
            taskId={showRunnerForTask}
            onClose={() => setShowRunnerForTask(null)}
          />
        )}

        {/* Recent activities */}
        {activities.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="font-semibold mb-4">最近活动</h3>
            <div className="space-y-2">
              {activities.map(act => (
                <div key={act.id} className="flex items-center gap-3 text-sm">
                  <span className="text-xs text-gray-400 w-32 shrink-0">
                    {new Date(act.createdAt).toLocaleString('zh-CN')}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    {ACTION_LABELS[act.action] || act.action}
                  </span>
                  {act.target && (
                    <code className="text-xs text-gray-400 truncate">{act.target.slice(0, 8)}</code>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
