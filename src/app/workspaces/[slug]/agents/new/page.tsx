'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AGENT_TYPES } from '@/lib/agents';

const TYPE_OPTIONS = Object.entries(AGENT_TYPES).map(([key, info]) => ({
  value: key,
  label: info.name,
  defaultPath: info.defaultPath,
  defaultArgs: info.defaultArgs,
}));

export default function NewAgentPage() {
  const router = useRouter();
  const routeParams = useParams();
  const slug = routeParams.slug as string;

  const [name, setName] = useState('');
  const [type, setType] = useState('claude_code');
  const [execPath, setExecPath] = useState('');
  const [argsTemplate, setArgsTemplate] = useState('');
  const [envVars, setEnvVars] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleTypeChange(newType: string) {
    setType(newType);
    const info = AGENT_TYPES[newType as keyof typeof AGENT_TYPES];
    if (info) {
      setExecPath(info.defaultPath);
      setArgsTemplate(info.defaultArgs);
    }
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
        execPath: execPath || null,
        argsTemplate: argsTemplate || null,
        envVars: envVars || null,
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

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href={`/workspaces/${slug}/agents`} className="text-gray-500 hover:text-gray-700">&larr; Agent 列表</Link>
        <h1 className="text-xl font-bold">注册 Agent</h1>
      </header>

      <main className="max-w-lg mx-auto p-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
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
          </div>

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
