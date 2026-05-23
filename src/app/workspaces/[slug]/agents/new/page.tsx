'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AGENT_TYPES } from '@/lib/agents';
import { ROLE_LABELS, ROLE_PERMISSIONS } from '@/types';

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
  pm: 'bg-yellow-100 text-yellow-700',
  architect: 'bg-purple-100 text-purple-700',
  developer: 'bg-blue-100 text-blue-700',
  qa: 'bg-green-100 text-green-700',
  delivery_manager: 'bg-orange-100 text-orange-700',
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
  const [envVars, setEnvVars] = useState('');
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
  }, [type]);

  function handleTypeChange(newType: string) {
    setType(newType);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch(`/api/workspaces/${slug}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        name,
        role,
        execPath: execPath || null,
        argsTemplate: argsTemplate || null,
        envVars: envVars || null,
        gitName: gitName || null,
        gitEmail: gitEmail || null,
      }),
    });

    if (res.ok) {
      router.push(`/workspaces/${slug}/agents`);
    } else {
      const data = await res.json();
      setError(data.error || '创建失败');
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

      <main className="max-w-lg mx-auto p-6">
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

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          {/* Type + Role side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Agent 类型</label>
              <select
                value={type}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ROLE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Role permission card */}
          {ROLE_PERMISSIONS[role] && (
            <div className="border border-blue-200 rounded-lg p-3 bg-blue-50">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${ROLE_BADGES[role] || 'bg-gray-100 text-gray-600'}`}>
                  {ROLE_LABELS[role]}
                </span>
                <span className="text-xs text-gray-500">此角色具有以下权限：</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-400">负责阶段：</span>
                  <span className="text-gray-700 font-mono ml-1">{ROLE_PERMISSIONS[role].stages}</span>
                </div>
                <div className="flex flex-wrap gap-1 items-start">
                  <span className="text-gray-400">能力：</span>
                  {ROLE_PERMISSIONS[role].capabilities.map((cap, i) => (
                    <span key={i} className="bg-white text-gray-600 px-1.5 py-0.5 rounded border border-gray-100">
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agent 名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">环境变量（JSON）</label>
            <textarea
              value={envVars}
              onChange={(e) => setEnvVars(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              rows={4}
              placeholder='{"ANTHROPIC_API_KEY": "sk-..."}'
            />
            <p className="text-xs text-gray-400 mt-1">API Key 等敏感信息通过环境变量传递</p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '注册中...' : '注册 Agent'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
