'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Agent {
  id: string;
  type: string;
  name: string;
  execPath: string | null;
  argsTemplate: string | null;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
}

const AGENT_TYPE_NAMES: Record<string, string> = {
  claude_code: 'Claude Code',
  codex: 'Codex CLI',
  hermes: 'Hermes',
  openclaw: 'OpenClaw',
  custom: '自定义',
};

const AGENT_TYPE_BADGES: Record<string, string> = {
  claude_code: 'bg-purple-100 text-purple-700',
  codex: 'bg-blue-100 text-blue-700',
  hermes: 'bg-green-100 text-green-700',
  openclaw: 'bg-orange-100 text-orange-700',
  custom: 'bg-gray-100 text-gray-600',
};

export default function AgentsPage() {
  const routeParams = useParams();
  const slug = routeParams.slug as string;

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [output, setOutput] = useState('');

  useEffect(() => {
    fetch(`/api/workspaces/${slug}/agents`)
      .then(r => r.json())
      .then(data => { setAgents(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  async function handleExecute(agentId: string) {
    const input = window.prompt('输入 Agent 指令：');
    if (!input) return;

    setExecuting(agentId);
    setOutput('执行中...');
    const res = await fetch(`/api/agents/${agentId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: input }),
    });
    const data = await res.json();
    setOutput(data.output || data.errors || '无输出');
    setExecuting(null);
  }

  async function handleDelete(agentId: string, name: string) {
    if (!confirm(`确定删除 Agent "${name}"？`)) return;
    await fetch(`/api/agents/${agentId}`, { method: 'DELETE' });
    setAgents(agents.filter(a => a.id !== agentId));
  }

  async function handleToggle(agentId: string, enabled: boolean) {
    await fetch(`/api/agents/${agentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !enabled }),
    });
    setAgents(agents.map(a => a.id === agentId ? { ...a, enabled: !enabled } : a));
  }

  return (
    <div>
      <div className="px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">Agent 管理</h1>
        <Link
          href={`/workspaces/${slug}/agents/new`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
        >
          注册 Agent
        </Link>
      </div>

      <main className="max-w-4xl mx-auto p-6">
        {output && (
          <div className="mb-4 bg-gray-900 text-green-400 rounded-xl p-4 font-mono text-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">执行结果</span>
              <button onClick={() => setOutput('')} className="text-gray-400 hover:text-white text-xs">关闭</button>
            </div>
            <pre className="whitespace-pre-wrap">{output}</pre>
          </div>
        )}

        {loading ? (
          <p className="text-gray-500">加载中...</p>
        ) : agents.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg mb-2">还没有注册 Agent</p>
            <p className="text-sm mb-4">注册 Claude Code、Codex 等 AI 智能体来辅助开发</p>
            <Link href={`/workspaces/${slug}/agents/new`} className="text-blue-600 hover:underline text-sm">注册第一个 Agent</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <div key={agent.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded ${AGENT_TYPE_BADGES[agent.type] || ''}`}>
                      {AGENT_TYPE_NAMES[agent.type] || agent.type}
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
                    <button
                      onClick={() => handleExecute(agent.id)}
                      disabled={executing === agent.id}
                      className="px-3 py-1.5 text-xs bg-gray-900 text-green-400 rounded-lg hover:bg-gray-800 disabled:opacity-50 font-mono"
                    >
                      {executing === agent.id ? '执行中...' : '▶ 执行'}
                    </button>
                    <button
                      onClick={() => handleDelete(agent.id, agent.name)}
                      className="px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
