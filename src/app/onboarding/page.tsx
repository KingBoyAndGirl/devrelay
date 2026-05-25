'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AGENT_TYPES } from '@/lib/agents';
import { ROLE_LABELS } from '@/types';

const RECOMMENDED_AGENTS = [
  { type: 'claude_code', role: 'developer', label: '开发工程师 (Claude Code)' },
  { type: 'claude_code', role: 'architect', label: '架构师 (Claude Code)' },
  { type: 'claude_code', role: 'qa', label: '测试工程师 (Claude Code)' },
];

interface GitHubRepo {
  name: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
  alreadyAdded?: boolean;
}

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);

  // Step 1: Workspace
  const [wsName, setWsName] = useState('');
  const [wsDesc, setWsDesc] = useState('');
  const [wsCreating, setWsCreating] = useState(false);
  const [workspace, setWorkspace] = useState<{ id: string; slug: string } | null>(null);

  // Step 2: GitHub
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoTokenId, setRepoTokenId] = useState<string | null>(null);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [reposDone, setReposDone] = useState(false);

  // Step 3: Agents
  const [agentCreateStatus, setAgentCreateStatus] = useState<Record<string, 'pending' | 'creating' | 'done' | 'error'>>({});
  const [agentsCreated, setAgentsCreated] = useState(false);

  // Step 4: Project
  const [projName, setProjName] = useState('');
  const [projCustomer, setProjCustomer] = useState('');
  const [projCreating, setProjCreating] = useState(false);
  const [project, setProject] = useState<{ id: string } | null>(null);

  const [error, setError] = useState('');

  // ── Step 1: Create workspace ──────────────────────────────────────

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!wsName.trim()) return;
    setWsCreating(true);
    setError('');

    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: wsName, description: wsDesc || null }),
    });

    if (res.ok) {
      const data = await res.json();
      setWorkspace(data);
      setStep(2);
    } else {
      const data = await res.json();
      setError(data.error || '创建失败');
    }
    setWsCreating(false);
  }

  // ── Step 2: GitHub repos ──────────────────────────────────────────

  async function loadRepos() {
    if (!workspace) return;
    setReposLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/workspaces/${workspace.slug}/repos/github-list`);
      const data = await res.json();
      if (res.ok && data.repos) {
        setRepos(data.repos);
        if (data.tokenId) setRepoTokenId(data.tokenId);
      } else if (res.status === 401 || res.status === 400) {
        setError('请先授权 GitHub 账号');
        setRepos([]);
      }
    } catch {
      setError('加载仓库列表失败');
    }
    setReposLoading(false);
  }

  useEffect(() => {
    if (step === 2 && workspace) loadRepos();
  }, [step, workspace]);

  function toggleRepo(fullName: string) {
    const next = new Set(selectedRepos);
    if (next.has(fullName)) next.delete(fullName);
    else next.add(fullName);
    setSelectedRepos(next);
  }

  async function handleImportRepos() {
    if (selectedRepos.size === 0 || !repoTokenId) {
      setReposDone(true);
      setStep(3);
      return;
    }
    setImporting(true);
    setError('');

    const res = await fetch(`/api/workspaces/${workspace!.slug}/repos/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenId: repoTokenId,
        repoFullNames: Array.from(selectedRepos),
      }),
    });

    if (res.ok) {
      setReposDone(true);
      setStep(3);
    } else {
      const data = await res.json();
      setError(data.error || '导入失败');
    }
    setImporting(false);
  }

  function skipRepos() {
    setReposDone(true);
    setStep(3);
  }

  // ── Step 3: Create agents ─────────────────────────────────────────

  async function handleCreateAgents() {
    setAgentsCreated(true);
    setError('');

    for (const a of RECOMMENDED_AGENTS) {
      const key = `${a.role}-${a.type}`;
      setAgentCreateStatus(prev => ({ ...prev, [key]: 'creating' }));

      try {
        const res = await fetch(`/api/workspaces/${workspace!.slug}/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: a.type, name: a.label, role: a.role }),
        });
        setAgentCreateStatus(prev => ({ ...prev, [key]: res.ok ? 'done' : 'error' }));
      } catch {
        setAgentCreateStatus(prev => ({ ...prev, [key]: 'error' }));
      }
    }

    setTimeout(() => setStep(4), 800);
  }

  function skipAgents() {
    setAgentsCreated(true);
    setStep(4);
  }

  // ── Step 4: Create project ────────────────────────────────────────

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!projName.trim()) return;
    setProjCreating(true);
    setError('');

    const res = await fetch(`/api/workspaces/${workspace!.slug}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: projName, customer: projCustomer || null }),
    });

    if (res.ok) {
      const data = await res.json();
      setProject(data);
      setStep(5);
    } else {
      const data = await res.json();
      setError(data.error || '创建失败');
    }
    setProjCreating(false);
  }

  // ── Render ────────────────────────────────────────────────────────

  const stepLabels = ['创建空间', '关联仓库', '注册 Agent', '创建项目', '完成'];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">DevRelay 设置向导</h1>
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">跳过，稍后设置 →</Link>
      </header>

      {/* Step indicator */}
      <div className="max-w-2xl mx-auto px-6 pt-8">
        <div className="flex items-center justify-between mb-8">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium shrink-0 ${
                step > i + 1 ? 'bg-green-500 text-white' :
                step === i + 1 ? 'bg-blue-600 text-white' :
                'bg-gray-200 text-gray-500'
              }`}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span className={`ml-2 text-sm hidden sm:inline ${step >= i + 1 ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                {label}
              </span>
              {i < stepLabels.length - 1 && (
                <div className={`w-8 sm:w-12 h-0.5 mx-1 sm:mx-2 ${step > i + 1 ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-6 pb-20">
        {error && (
          <div className="alert-error mb-4">{error}</div>
        )}

        {/* Step 1: Create Workspace */}
        {step === 1 && (
          <form onSubmit={handleCreateWorkspace} className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold">创建你的第一个空间</h2>
            <p className="text-sm text-gray-500">空间是用来组织项目和团队的工作区</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">空间名称</label>
              <input
                type="text"
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                className="input"
                placeholder="例如：我的团队"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">描述（可选）</label>
              <textarea
                value={wsDesc}
                onChange={(e) => setWsDesc(e.target.value)}
                className="input"
                rows={2}
                placeholder="团队的工作空间"
              />
            </div>
            <button
              type="submit"
              disabled={wsCreating || !wsName.trim()}
              className="btn-primary w-full"
            >
              {wsCreating ? '创建中...' : '下一步：关联 GitHub →'}
            </button>
          </form>
        )}

        {/* Step 2: GitHub Repos */}
        {step === 2 && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold">关联 GitHub 仓库</h2>
            <p className="text-sm text-gray-500">选择你要导入到项目中的代码仓库</p>

            {error && repos.length === 0 && (
              <a
                href={`/api/auth/github?workspaceSlug=${workspace!.slug}&redirect=/onboarding`}
                className="flex items-center justify-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-lg hover:bg-gray-800 text-sm"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                授权 GitHub 账号
              </a>
            )}

            {reposLoading ? (
              <p className="text-sm text-gray-400 py-4">加载仓库列表...</p>
            ) : repos.length > 0 ? (
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y">
                {repos.map((repo) => (
                  <label
                    key={repo.fullName}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 ${
                      repo.alreadyAdded ? 'opacity-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRepos.has(repo.fullName)}
                      onChange={() => toggleRepo(repo.fullName)}
                      disabled={repo.alreadyAdded}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{repo.fullName}</p>
                      <p className="text-xs text-gray-400">{repo.defaultBranch}</p>
                    </div>
                    {repo.private && <span className="text-xs text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">私有</span>}
                    {repo.alreadyAdded && <span className="text-xs text-gray-400">已导入</span>}
                  </label>
                ))}
              </div>
            ) : !error ? (
              <p className="text-sm text-gray-400 py-4">没有找到仓库</p>
            ) : null}

            <div className="flex gap-3">
              <button onClick={skipRepos} className="btn-secondary flex-1">
                跳过
              </button>
              <button
                onClick={handleImportRepos}
                disabled={importing}
                className="btn-primary flex-1"
              >
                {importing ? '导入中...' : selectedRepos.size > 0 ? `导入 ${selectedRepos.size} 个仓库 →` : '下一步 →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Create Agents */}
        {step === 3 && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold">注册 AI Agent</h2>
            <p className="text-sm text-gray-500">AI Agent 会自动认领任务、编写代码和评审</p>

            <div className="space-y-3">
              {RECOMMENDED_AGENTS.map((a) => {
                const key = `${a.role}-${a.type}`;
                const status = agentCreateStatus[key];
                return (
                  <div key={key} className="flex items-center justify-between card px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{a.label}</p>
                      <p className="text-xs text-gray-400">角色: {ROLE_LABELS[a.role] || a.role}</p>
                    </div>
                    <span className={
                      status === 'done' ? 'badge-success' :
                      status === 'creating' ? 'badge-primary' :
                      status === 'error' ? 'badge-error' :
                      'badge-gray'
                    }>
                      {status === 'done' ? '✓ 已创建' :
                       status === 'creating' ? '创建中...' :
                       status === 'error' ? '失败' : '待创建'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button onClick={skipAgents} className="btn-secondary flex-1">跳过</button>
              <button
                onClick={handleCreateAgents}
                disabled={agentsCreated}
                className="btn-primary flex-1"
              >
                {agentsCreated ? '已创建 →' : '自动创建推荐 Agent →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Create Project */}
        {step === 4 && (
          <form onSubmit={handleCreateProject} className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold">创建第一个项目</h2>
            <p className="text-sm text-gray-500">项目会按 13 步交付流程自动创建阶段</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">项目名称</label>
              <input
                type="text"
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                className="input"
                placeholder="例如：v2.0 交付"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">客户名称（可选）</label>
              <input
                type="text"
                value={projCustomer}
                onChange={(e) => setProjCustomer(e.target.value)}
                className="input"
                placeholder="客户公司名称"
              />
            </div>
            <button
              type="submit"
              disabled={projCreating || !projName.trim()}
              className="btn-primary w-full"
            >
              {projCreating ? '创建中...' : '创建项目 →'}
            </button>
          </form>
        )}

        {/* Step 5: Done */}
        {step === 5 && (
          <div className="card p-6 text-center space-y-4">
            <div className="text-4xl">&#8203;</div>
            <h2 className="text-lg font-semibold">设置完成！</h2>
            <div className="text-sm text-gray-500 space-y-1">
              <p>✓ 空间 "{wsName}" 已创建</p>
              {reposDone && <p>✓ GitHub 仓库已关联</p>}
              {agentsCreated && <p>✓ AI Agent 已就绪</p>}
              {project && <p>✓ 项目 "{projName}" 已创建</p>}
            </div>
            {project && workspace && (
              <Link
                href={`/workspaces/${workspace.slug}/projects/${project.id}`}
                className="btn-primary"
              >
                进入项目看板 →
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
