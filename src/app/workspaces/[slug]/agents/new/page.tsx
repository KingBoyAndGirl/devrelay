'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { AGENT_TYPES } from '@/lib/agents';
import { ROLE_LABELS } from '@/types';
import PermissionSelector from '@/components/agents/PermissionSelector';
import { getEnvKeyLabel, getEnvKeyPlaceholder, isApiKeyField } from '@/lib/agents';
import type { Role } from '@/lib/permissions';

interface DiscoveredCLI {
  bin: string;
  found: boolean;
  path: string | null;
  version: string | null;
}

const CLI_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  copilot: 'GitHub Copilot',
  openclaw: 'OpenClaw',
  opencode: 'OpenCode',
  hermes: 'Hermes',
  gemini: 'Gemini',
  pi: 'Pi',
  'cursor-agent': 'Cursor Agent',
  kimi: 'Kimi',
  'kiro-cli': 'Kiro CLI',
};

const TYPE_TO_BIN: Record<string, string> = {
  claude_code: 'claude',
  codex: 'codex',
  hermes: 'hermes',
  openclaw: 'openclaw',
};

const TYPE_OPTIONS = Object.entries(AGENT_TYPES).map(([key, info]) => ({
  value: key,
  label: info.name,
  defaultPath: info.defaultPath,
  defaultArgs: info.defaultArgs,
}));

const ROLE_OPTIONS = Object.entries(ROLE_LABELS)
  .filter(([key]) => key !== 'admin')
  .map(([key, label]) => ({ value: key, label }));

const ROLE_BADGES: Record<string, string> = {
  pm: 'badge-warning',
  architect: 'badge-purple',
  developer: 'badge-primary',
  qa: 'badge-success',
  delivery_manager: 'badge-orange',
};

export default function NewAgentPage() {
  const router = useRouter();
  const routeParams = useParams();
  const slug = routeParams.slug as string;

  const [name, setName] = useState('');
  const [type, setType] = useState('claude_code');
  const [role, setRole] = useState('developer');
  const [execPath, setExecPath] = useState('');
  const [argsTemplate, setArgsTemplate] = useState('');
  const getDefaultEnvEntries = (t: string) => {
    const keys = AGENT_TYPES[t as keyof typeof AGENT_TYPES]?.defaultEnvKeys || ['PROVIDER_BASE_URL', 'ANTHROPIC_API_KEY'];
    return keys.map(k => ({key: k, value: ''}));
  };

  const [envVarEntries, setEnvVarEntries] = useState<{key: string; value: string}[]>(getDefaultEnvEntries(type));
  const [visibleValues, setVisibleValues] = useState<Set<number>>(new Set());
  const [gitName, setGitName] = useState('');
  const [gitEmail, setGitEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [discovered, setDiscovered] = useState<DiscoveredCLI[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);

  useEffect(() => {
    fetch('/api/agents/discover')
      .then(r => r.json())
      .then(data => { setDiscovered(data.clis || []); setDiscoverLoading(false); })
      .catch(() => setDiscoverLoading(false));
  }, []);

  useEffect(() => {
    const info = AGENT_TYPES[type as keyof typeof AGENT_TYPES];
    if (!info) return;
    setExecPath(info.defaultPath);
    setArgsTemplate(info.defaultArgs);
    setEnvVarEntries(info.defaultEnvKeys.map(k => ({key: k, value: ''})));
    setVisibleValues(new Set());
  }, [type]);

  function addEnvVarEntry() {
    setEnvVarEntries(prev => [...prev, {key: '', value: ''}]);
  }

  function removeEnvVarEntry(index: number) {
    setEnvVarEntries(prev => prev.filter((_, i) => i !== index));
  }

  function updateEnvVarKey(index: number, key: string) {
    setEnvVarEntries(prev => prev.map((e, i) => i === index ? {...e, key} : e));
  }

  function updateEnvVarValue(index: number, value: string) {
    setEnvVarEntries(prev => prev.map((e, i) => i === index ? {...e, value} : e));
  }

  function buildEnvVarsJson(): string | null {
    const obj: Record<string, string> = {};
    for (const e of envVarEntries) {
      if (e.key.trim()) obj[e.key.trim()] = e.value;
    }
    const keys = Object.keys(obj);
    return keys.length > 0 ? JSON.stringify(obj) : null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch(`/api/workspaces/${slug}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        name,
        role,
        execPath: execPath || null,
        argsTemplate: argsTemplate || null,
        envVars: buildEnvVarsJson(),
        gitName: gitName || null,
        gitEmail: gitEmail || null,
      }),
    });

    if (res.ok) {
      toast.success('Agent 注册成功');
      router.push(`/workspaces/${slug}/agents`);
    } else {
      const data = await res.json();
      toast.error(data.error || '创建失败');
    }
    setLoading(false);
  }

  const binForType = TYPE_TO_BIN[type];
  const detected = discovered.find(d => d.bin === binForType);

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href={`/workspaces/${slug}/agents`} className="text-gray-500 hover:text-gray-700">&larr; Agent 列表</Link>
        <h1 className="text-xl font-bold">注册 Agent</h1>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        {/* CLI Discovery Panel */}
        <div className="mb-5 bg-gray-50 border border-gray-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-700 mb-3">服务器已检测到的 CLI</h2>
          {discoverLoading ? (
            <p className="text-xs text-gray-400">检测中...</p>
          ) : discovered.length === 0 ? (
            <p className="text-xs text-gray-400">无法获取检测结果</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {discovered.map((cli) => (
                <span
                  key={cli.bin}
                  className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                    cli.found
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-gray-100 border-gray-200 text-gray-400'
                  }`}
                  title={cli.found ? `${cli.path} — ${cli.version || 'unknown version'}` : '未安装'}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${cli.found ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {CLI_LABELS[cli.bin] || cli.bin}
                  {cli.version && cli.found && (
                    <span className="text-gray-400 font-mono">{cli.version.split(' ').slice(-1)[0]?.slice(0, 12) || ''}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>


        <form onSubmit={handleSubmit} className="card p-5 space-y-4">
          {/* Type + Role side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Agent 类型</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="input"
              >
                {TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {binForType && (
                <p className="text-xs mt-1">
                  {detected?.found ? (
                    <span className="text-green-600">已检测到 ✅</span>
                  ) : (
                    <span className="text-yellow-600">未检测到 ⚠️</span>
                  )}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Agent 角色</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="input"
              >
                {ROLE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Permission selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">权限配置</label>
            <PermissionSelector role={role as Role} />
            <p className="text-xs text-gray-400 mt-1">展开查看并按需调整角色权限</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agent 名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="例如：后端开发助手"
              required
            />
          </div>

          {/* Git config */}
          <fieldset className="border border-gray-200 rounded-lg p-4">
            <legend className="text-sm font-medium text-gray-700 px-1">Git 配置（commit 用）</legend>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">用户名</label>
                <input
                  type="text"
                  value={gitName}
                  onChange={(e) => setGitName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="例如：DevRelay Bot"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">邮箱</label>
                <input
                  type="email"
                  value={gitEmail}
                  onChange={(e) => setGitEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="例如：bot@devrelay.local"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">Agent 提交代码时使用的 Git 身份</p>
          </fieldset>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CLI 可执行文件路径</label>
            <input
              type="text"
              value={execPath}
              onChange={(e) => setExecPath(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder="例如：claude 或 /usr/local/bin/claude"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">参数模板</label>
            <input
              type="text"
              value={argsTemplate}
              onChange={(e) => setArgsTemplate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder='例如：-p "{prompt}" --output-format stream-json'
            />
            <p className="text-xs text-gray-400 mt-1">使用 {'{prompt}'} 作为输入占位符</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">环境变量</label>
            <p className="text-xs text-gray-400 mb-2">配置 Agent 运行时需要的环境变量（API Key 等）</p>
            <div className="space-y-3">
              {envVarEntries.map((entry, i) => {
                const metaLabel = getEnvKeyLabel(entry.key);
                const metaPlaceholder = getEnvKeyPlaceholder(entry.key);
                const isKey = isApiKeyField(entry.key);
                const isShown = visibleValues.has(i);
                // Sort: URL entries first
                const isUrl = entry.key.includes('URL') || entry.key.includes('BASE_URL');
                return { entry, i, metaLabel, metaPlaceholder, isKey, isShown, isUrl };
              }).sort((a, b) => {
                if (a.isUrl && !b.isUrl) return -1;
                if (!a.isUrl && b.isUrl) return 1;
                return 0;
              }).map(({ entry, i, metaLabel, metaPlaceholder, isKey, isShown, isUrl }) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3 bg-white">
                    <div className="flex items-center gap-2 mb-2">
                      {metaLabel ? (
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-700">{metaLabel}</span>
                      ) : (
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-200 text-gray-500">{entry.key || '自定义'}</span>
                      )}
                    </div>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={entry.key}
                        onChange={(e) => updateEnvVarKey(i, e.target.value)}
                        className="w-48 px-2 py-2 border border-gray-200 rounded text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="环境变量名"
                      />
                      <div className="flex-1 relative">
                        <input
                          type={isKey && !isShown ? 'password' : 'text'}
                          value={entry.value}
                          onChange={(e) => updateEnvVarValue(i, e.target.value)}
                          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                          placeholder={metaPlaceholder || '变量值'}
                        />
                        {isKey && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = new Set(visibleValues);
                              if (next.has(i)) next.delete(i); else next.add(i);
                              setVisibleValues(next);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                            title={isShown ? '隐藏' : '显示'}
                          >
                            {isShown ? (
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            ) : (
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                            )}
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeEnvVarEntry(i)}
                        className="shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="移除"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
            </div>
            <button
              type="button"
              onClick={addEnvVarEntry}
              className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              + 添加环境变量
            </button>
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-secondary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
            >
              {loading ? '注册中...' : '注册 Agent'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
