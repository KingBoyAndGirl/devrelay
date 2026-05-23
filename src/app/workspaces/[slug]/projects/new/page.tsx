'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewProjectPage() {
  const router = useRouter();
  const routeParams = useParams();
  const slug = routeParams.slug as string;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customer, setCustomer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch(`/api/workspaces/${slug}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, customer: customer || null }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/workspaces/${slug}/projects/${data.id}`);
    } else {
      const data = await res.json();
      setError(data.error || '创建失败');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href={`/workspaces/${slug}/projects`} className="text-gray-500 hover:text-gray-700">&larr; 返回项目列表</Link>
        <h1 className="text-xl font-bold">新建项目</h1>
      </header>
      <main className="max-w-lg mx-auto p-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">项目名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例如：v2.0 交付"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="项目目标与范围"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">客户名称（可选）</label>
            <input
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="客户公司名称"
            />
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
              {loading ? '创建中...' : '创建项目'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
