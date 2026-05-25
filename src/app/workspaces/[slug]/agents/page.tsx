'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { Bot, Search } from 'lucide-react';
import ConfirmModal from '@/components/ui/ConfirmModal';
import CopyButton from '@/components/ui/CopyButton';
import { ListSkeleton } from '@/components/ui/SkeletonLoader';
import AgentRunner from '@/components/agents/AgentRunner';
import { ROLE_LABELS } from '@/types';

interface Agent {
  id: string;
  type: string;
  name: string;
  role: string;
  execPath: string | null;
  argsTemplate: string | null;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
}

interface AgentToken {
  id: string;
  name: string;
  tokenPreview: string;
  createdAt: string;
  lastSeenAt: string | null;
  online: boolean;
}

interface AgentTokenInfo {
  id: string;
  name: string;
  online: boolean;
  lastSeenAt: string | null;
  agentVersion: string | null;
  detectedClis: string[];
  cliDetails: { bin: string; version: string | null }[];
  activeCount: number;
  maxConcurrent: number;
  queueLength: number;
  sidecarReachable: boolean;
}

const AGENT_TYPE_NAMES: Record<string, string> = {
  claude_code: 'Claude Code',
  codex: 'Codex CLI',
  hermes: 'Hermes',
  openclaw: 'OpenClaw',
  custom: '自定义',
};

const AGENT_TYPE_BADGES: Record<string, string> = {
  claude_code: 'badge-purple',
  codex: 'badge-primary',
  hermes: 'badge-success',
  openclaw: 'badge-orange',
  custom: 'badge-gray',
};

const ROLE_BADGES: Record<string, string> = {
  pm: 'badge-warning',
  architect: 'badge-purple',
  developer: 'badge-primary',
  qa: 'badge-success',
  delivery_manager: 'badge-orange',
};

export default function AgentsPage() {
  const routeParams = useParams();
  const slug = routeParams.slug as string;

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeRunner, setActiveRunner] = useState<string | null>(null);

  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [newToken, setNewToken] = useState<{ id: string; name: string; token: string } | null>(null);
  const [newTokenName, setNewTokenName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [fullTokens, setFullTokens] = useState<Record<string, string>>({});
  const [agentInfos, setAgentInfos] = useState<AgentTokenInfo[]>([]);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [cliUpdates, setCliUpdates] = useState<Record<string, { latest: string; npmPackage: string }>>({});
  const [updating, setUpdating] = useState<Record<string, 'loading' | 'done' | 'error'>>({});
  const [confirmDeleteAgent, setConfirmDeleteAgent] = useState<{ id: string; name: string } | null>(null);
  const [confirmRevokeToken, setConfirmRevokeToken] = useState<{ id: string; name: string } | null>(null);

  async function updatePackage(pkg: string) {
    setUpdating(prev => ({ ...prev, [pkg]: 'loading' }));
    try {
      const res = await fetch(`/api/workspaces/${slug}/agent-info/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: pkg }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUpdating(prev => ({ ...prev, [pkg]: 'done' }));
        // Refresh agent info and CLI versions after update
        setTimeout(() => {
          loadAgentInfo();
          loadLatestVersion();
          loadCliUpdates();
          setUpdating(prev => { const n = { ...prev }; delete n[pkg]; return n; });
        }, 2000);
      } else {
        setUpdating(prev => ({ ...prev, [pkg]: 'error' }));
        setTimeout(() => setUpdating(prev => { const n = { ...prev }; delete n[pkg]; return n; }), 3000);
      }
    } catch {
      setUpdating(prev => ({ ...prev, [pkg]: 'error' }));
      setTimeout(() => setUpdating(prev => { const n = { ...prev }; delete n[pkg]; return n; }), 3000);
    }
  }

  async function updateCli(cliName: string) {
    setUpdating(prev => ({ ...prev, [cliName]: 'loading' }));
    try {
      const res = await fetch(`/api/workspaces/${slug}/agent-info/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cli: cliName }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUpdating(prev => ({ ...prev, [cliName]: 'done' }));
        setTimeout(() => {
          loadAgentInfo();
          loadLatestVersion();
          loadCliUpdates();
          setUpdating(prev => { const n = { ...prev }; delete n[cliName]; return n; });
        }, 2000);
      } else {
        setUpdating(prev => ({ ...prev, [cliName]: 'error' }));
        setTimeout(() => setUpdating(prev => { const n = { ...prev }; delete n[cliName]; return n; }), 3000);
      }
    } catch {
      setUpdating(prev => ({ ...prev, [cliName]: 'error' }));
      setTimeout(() => setUpdating(prev => { const n = { ...prev }; delete n[cliName]; return n; }), 3000);
    }
  }

  useEffect(() => {
    fetch(`/api/workspaces/${slug}/agents`)
      .then(r => r.json())
      .then(data => { setAgents(data); setLoading(false); })
      .catch(() => setLoading(false));

    loadTokens();
    loadAgentInfo();
    loadLatestVersion();
    loadCliUpdates();

    const socket: Socket = io({ transports: ['websocket', 'polling'] });
    socket.on('agent:status', (data: { workspaceSlug: string; tokenId: string; online: boolean; lastSeenAt: string | null }) => {
      if (data.workspaceSlug !== slug) return;
      setTokens(prev => prev.map(t =>
        t.id === data.tokenId ? { ...t, online: data.online, lastSeenAt: data.lastSeenAt } : t
      ));
      loadAgentInfo();
    });
    return () => { socket.disconnect(); };
  }, [slug]);

  async function loadTokens() {
    const res = await fetch(`/api/workspaces/${slug}/agent-token`);
    if (res.ok) {
      const data = await res.json();
      setTokens(data.tokens || []);
    }
  }

  async function loadAgentInfo() {
    const res = await fetch(`/api/workspaces/${slug}/agent-info`);
    if (res.ok) {
      const data = await res.json();
      setAgentInfos(data.tokens || []);
    }
  }

  async function loadLatestVersion() {
    try {
      const res = await fetch(`/api/workspaces/${slug}/agent-info/latest-version`);
      if (res.ok) {
        const data = await res.json();
        if (data.latestVersion) setLatestVersion(data.latestVersion);
      }
    } catch {}
  }

  async function loadCliUpdates() {
    try {
      const res = await fetch(`/api/workspaces/${slug}/agent-info/cli-updates`);
      if (res.ok) {
        const data = await res.json();
        setCliUpdates(data);
      }
    } catch {}
  }

  async function handleDelete(agentId: string) {
    await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
    toast.success('Agent 已删除');
    setAgents(agents.filter(a => a.id !== agentId));
    if (activeRunner === agentId) setActiveRunner(null);
  }

  async function handleToggle(agentId: string, enabled: boolean) {
    await fetch(`/api/agents/${agentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setAgents(agents.map(a => a.id === agentId ? { ...a, enabled: !enabled } : a));
  }

  async function handleGenerateToken() {
    setTokenLoading(true);
    const res = await fetch(`/api/workspaces/${slug}/agent-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTokenName || undefined }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewToken({ id: data.id, name: data.name, token: data.token });
      setFullTokens(prev => ({ ...prev, [data.id]: data.token }));
      setShowCreateForm(false);
      setNewTokenName('');
      loadTokens();
    }
    setTokenLoading(false);
  }

  async function handleRevealAndCopy(id: string) {
    try {
      const res = await fetch(`/api/workspaces/${slug}/agent-token?reveal=${id}`);
      if (res.ok) {
        const data = await res.json();
        const cmd = `devrelay configure --token ${data.token} --url ${window.location.origin}`;
        await navigator.clipboard.writeText(cmd);
        toast.success('已复制到剪贴板');
      }
    } catch {}
  }

  async function handleRevokeToken(id: string) {
    setTokenLoading(true);
    await fetch(`/api/workspaces/${slug}/agent-token?id=${id}`, { method: 'DELETE' });
    setFullTokens(prev => { const next = { ...prev }; delete next[id]; return next; });
    loadTokens();
    setTokenLoading(false);
  }

  const filteredAgents = search
    ? agents.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : agents;

  return (
    <>
      <div className="px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">Agent 管理</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 Agent..."
              className="pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
            />
          </div>
          <Link
            href={`/workspaces/${slug}/agents/new`}
            className="btn-primary"
          >
            注册 Agent
          </Link>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Registered Agents */}
        <div>
          <h3 className="section-title mb-3">已注册的 Agent</h3>
          {loading ? (
            <ListSkeleton count={5} />
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Bot className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-base mb-2">{search ? '未找到匹配的 Agent' : '还没有注册 Agent'}</p>
              <p className="text-sm mb-4">{search ? '尝试其他搜索词' : '注册 Claude Code、Codex 等 AI 智能体来辅助开发'}</p>
              {!search && <Link href={`/workspaces/${slug}/agents/new`} className="text-blue-600 hover:underline text-sm">注册第一个 Agent</Link>}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAgents.map((agent) => (
                <div key={agent.id}>
                  <div className="card p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={AGENT_TYPE_BADGES[agent.type] || 'badge-gray'}>
                          {AGENT_TYPE_NAMES[agent.type] || agent.type}
                        </span>
                        <span className={ROLE_BADGES[agent.role] || 'badge-gray'}>
                          {ROLE_LABELS[agent.role] || agent.role}
                        </span>
                        <div>
                          <h3 className="font-semibold">{agent.name}</h3>
                          <p className="text-xs text-gray-400">
                            {agent.execPath || '默认路径'} · 创建于 {new Date(agent.createdAt).toLocaleDateString('zh-CN')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${agent.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <button
                          onClick={() => handleToggle(agent.id, agent.enabled)}
                          className="text-xs text-gray-500 hover:text-gray-700 px-2"
                        >
                          {agent.enabled ? '禁用' : '启用'}
                        </button>
                        <Link
                          href={`/workspaces/${slug}/agents/${agent.id}`}
                          className="btn btn-secondary btn-sm"
                        >
                          编辑
                        </Link>
                        <button
                          onClick={() => setActiveRunner(activeRunner === agent.id ? null : agent.id)}
                          className="px-3 py-1.5 text-xs bg-gray-900 text-green-400 rounded-lg hover:bg-gray-800 font-mono"
                        >
                          {activeRunner === agent.id ? '收起' : '▶ 执行'}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteAgent({ id: agent.id, name: agent.name })}
                          className="btn btn-danger btn-sm"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>

                  {activeRunner === agent.id && (
                    <div className="mt-3">
                      <AgentRunner
                        agentId={agent.id}
                        agentName={agent.name}
                        onClose={() => setActiveRunner(null)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <hr className="border-gray-200" />

        {/* Connected Agent Info */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title">已连接的 Agent</h3>
            <button
              onClick={() => { loadAgentInfo(); loadLatestVersion(); loadCliUpdates(); }}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
            >
              刷新
            </button>
          </div>
          {agentInfos.length > 0 && agentInfos.some(a => a.agentVersion) && latestVersion && agentInfos.some(a => a.agentVersion && a.agentVersion !== latestVersion) && (() => {
            const pkg = 'devrelay-agent';
            const st = updating[pkg];
            return (
              <div className="alert-warning p-3 mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-700 text-sm font-medium">devrelay-agent 有新版本</span>
                    <span className="text-xs text-gray-400">v{agentInfos.find(a => a.agentVersion)?.agentVersion}</span>
                    <span className="text-xs text-gray-400">→</span>
                    <span className="text-xs font-mono text-blue-600">v{latestVersion}</span>
                  </div>
                  <button
                    onClick={() => !st && updatePackage(`devrelay-agent@${latestVersion}`)}
                    disabled={!!st}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                      st === 'loading' ? 'bg-blue-400 text-white cursor-wait' :
                      st === 'done' ? 'bg-green-600 text-white' :
                      st === 'error' ? 'bg-red-600 text-white' :
                      'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {st === 'loading' ? '更新中...' : st === 'done' ? '已更新 ✓' : st === 'error' ? '更新失败' : '立即更新'}
                  </button>
                </div>
              </div>
            );
          })()}
          {agentInfos.length === 0 ? (
            <p className="text-sm text-gray-400">暂无已连接的 Agent</p>
          ) : (
            <div className="space-y-3">
              {agentInfos.map((info) => (
                <div key={info.id} className="card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${info.online ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                    <span className="text-sm font-medium">{info.name}</span>
                    <span className={info.online ? 'badge-success' : 'badge-gray'}>
                      {info.online ? '已连接' : '未连接'}
                    </span>
                    {info.agentVersion && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-mono">
                        v{info.agentVersion}
                      </span>
                    )}
                  </div>

                  {info.agentVersion && latestVersion && info.agentVersion !== latestVersion && (() => {
                    const pkg = 'devrelay-agent';
                    const st = updating[pkg];
                    return (
                      <div className="flex items-center gap-2 mb-3">
                        <button
                          onClick={() => !st && updatePackage(`devrelay-agent@${latestVersion}`)}
                          disabled={!!st}
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors ${
                            st === 'loading' ? 'bg-blue-400 text-white cursor-wait' :
                            st === 'done' ? 'bg-green-600 text-white' :
                            st === 'error' ? 'bg-red-600 text-white' :
                            'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {st === 'loading' ? '更新中...' : st === 'done' ? '已更新 ✓' : st === 'error' ? '更新失败' : `更新到 v${latestVersion}`}
                        </button>
                      </div>
                    );
                  })()}

                  {(info.cliDetails || []).length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1.5">已检测到的 CLI：</p>
                      <div className="space-y-2">
                        {(info.cliDetails || []).map((cli) => {
                          const currentVer = cli.version?.match(/(\d+\.\d+\.\d+)/)?.[1] || null;
                          const update = cliUpdates[cli.bin];
                          const hasUpdate = update?.latest && currentVer && update.latest !== currentVer;
                          return (
                            <div key={cli.bin} className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                                hasUpdate
                                  ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                  : 'bg-green-50 text-green-700 border-green-200'
                              }`}>
                                <span className="font-medium">{cli.bin}</span>
                                {cli.version && (
                                  <span className="font-mono opacity-70">{cli.version}</span>
                                )}
                              </span>
                              {hasUpdate && (() => {
                                const st = updating[cli.bin];
                                return (
                                  <>
                                    <span className="text-xs text-gray-400">→</span>
                                    <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-200 font-mono">
                                      v{update.latest}
                                    </span>
                                    <button
                                      onClick={() => !st && updateCli(cli.bin)}
                                      disabled={!!st}
                                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                                        st === 'loading' ? 'bg-blue-400 text-white cursor-wait' :
                                        st === 'done' ? 'bg-green-600 text-white' :
                                        st === 'error' ? 'bg-red-600 text-white' :
                                        'bg-blue-600 text-white hover:bg-blue-700'
                                      }`}
                                    >
                                      {st === 'loading' ? '更新中...' : st === 'done' ? '已更新 ✓' : st === 'error' ? '失败' : '更新'}
                                    </button>
                                  </>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {info.sidecarReachable && (
                    <div className="flex items-center gap-4 text-xs text-gray-500 pt-2 border-t border-gray-100">
                      <span>
                        活跃任务: <span className="font-medium text-gray-700">{info.activeCount}</span>
                        <span className="text-gray-400">/{info.maxConcurrent}</span>
                      </span>
                      {info.queueLength > 0 && (
                        <span>
                          队列等待: <span className="font-medium text-yellow-600">{info.queueLength}</span>
                        </span>
                      )}
                      <span className="text-green-600">Sidecar 可达</span>
                    </div>
                  )}

                  {!info.sidecarReachable && info.online && (
                    <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                      远程 Agent · 无法直接查询 Sidecar 状态
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <hr className="border-gray-200" />

        {/* Agent Tokens */}
        <div>
          <h3 className="section-title mb-3">连接令牌</h3>
          <p className="text-xs text-gray-500 mb-3">
            为每台宿主机生成独立令牌，在宿主机上运行 <code className="bg-gray-100 px-1 rounded">devrelay configure --token &lt;令牌&gt;</code> 建立连接。
          </p>

          {/* New token one-time display */}
          {newToken && (
            <div className="alert-warning p-3 mb-3">
              <p className="text-xs mb-2 font-medium">令牌 "{newToken.name}" 已生成，请立即复制（仅显示一次）：</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white px-2 py-1.5 rounded border border-yellow-300 font-mono break-all">
                  {newToken.token}
                </code>
                <CopyButton text={newToken.token} className="px-3 py-1.5 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700 shrink-0 inline-flex items-center gap-1" />
              </div>
              <div className="mt-3 text-xs text-gray-600 bg-gray-50 rounded p-2">
                <p className="font-medium mb-1">在宿主机上运行：</p>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 text-green-700 bg-white px-2 py-1.5 rounded border border-gray-200 break-all select-all">
                    devrelay configure --token {newToken.token} --url {window.location.origin}
                  </code>
                  <CopyButton text={`devrelay configure --token ${newToken.token} --url ${window.location.origin}`} className="px-2 py-1.5 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 shrink-0 inline-flex items-center gap-1" />
                </div>
              </div>
              <button
                onClick={() => setNewToken(null)}
                className="mt-2 text-xs text-gray-500 hover:text-gray-700"
              >
                关闭
              </button>
            </div>
          )}

          {/* Token list */}
          {tokens.length > 0 && (
            <div className="space-y-2 mb-3">
              {tokens.map((t) => {
                const info = agentInfos.find(a => a.id === t.id);
                return (
                <div key={t.id} className="flex items-center justify-between card px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${t.online ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{t.name}</span>
                        <code className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{t.tokenPreview}</code>
                        <span className={t.online ? 'badge-success' : 'badge-gray'}>
                          {t.online ? '在线' : '离线'}
                        </span>
                        {info?.agentVersion && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">
                            v{info.agentVersion}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        创建: {new Date(t.createdAt).toLocaleDateString('zh-CN')}
                        {t.lastSeenAt && (
                          <span className="ml-2">最后连接: {new Date(t.lastSeenAt).toLocaleString('zh-CN')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRevealAndCopy(t.id)}
                      className="text-xs text-blue-500 hover:text-blue-700"
                      title="复制配置命令"
                    >
                      复制
                    </button>
                    <button
                      onClick={() => setConfirmRevokeToken({ id: t.id, name: t.name })}
                      disabled={tokenLoading}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      撤销
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {tokens.length === 0 && !showCreateForm && (
            <p className="text-sm text-gray-400 mb-3">暂无令牌</p>
          )}

          {/* Create form */}
          {showCreateForm ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder="令牌名称（如：生产服务器）"
                className="input flex-1"
                autoFocus
              />
              <button
                onClick={handleGenerateToken}
                disabled={tokenLoading}
                className="btn-primary"
              >
                {tokenLoading ? '生成中...' : '确认'}
              </button>
              <button
                onClick={() => { setShowCreateForm(false); setNewTokenName(''); }}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreateForm(true)}
              className="btn-primary"
            >
              生成令牌
            </button>
          )}
        </div>
      </main>
      <ConfirmModal
        open={confirmDeleteAgent !== null}
        title="删除 Agent"
        message={`确定删除 Agent "${confirmDeleteAgent?.name}"？`}
        confirmLabel="删除"
        variant="danger"
        onConfirm={() => { const id = confirmDeleteAgent!.id; setConfirmDeleteAgent(null); handleDelete(id); }}
        onCancel={() => setConfirmDeleteAgent(null)}
      />
      <ConfirmModal
        open={confirmRevokeToken !== null}
        title="撤销令牌"
        message={`撤销令牌 "${confirmRevokeToken?.name}" 后，对应的 Agent 将无法连接。确定继续？`}
        confirmLabel="撤销"
        variant="danger"
        onConfirm={() => { const id = confirmRevokeToken!.id; setConfirmRevokeToken(null); handleRevokeToken(id); }}
        onCancel={() => setConfirmRevokeToken(null)}
      />
    </>
  );
}
