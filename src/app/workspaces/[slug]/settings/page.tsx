'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/workspaces/${slug}`)
      .then(r => r.json())
      .then(data => {
        setName(data.name || '');
        setDescription(data.description || '');
      });
  }, [slug]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch(`/api/workspaces/${slug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/workspaces/${data.slug}`);
    } else {
      const data = await res.json();
      setError(data.error || '更新失败');
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm('确定要删除此空间吗？此操作不可撤销。')) return;
    setDeleting(true);
    const res = await fetch(`/api/workspaces/${slug}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/');
    } else {
      const data = await res.json();
      setError(data.error || '删除失败');
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">&larr; 返回</button>
        <h1 className="text-xl font-bold">空间设置</h1>
      </header>
      <main className="max-w-lg mx-auto p-6 space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">空间名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </form>

        <hr className="border-gray-200" />

        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <h3 className="font-semibold text-red-800">危险区域</h3>
          <p className="text-sm text-red-600 mt-1 mb-4">删除空间将同时删除所有关联的项目、仓库和智能体。</p>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? '删除中...' : '删除此空间'}
          </button>
        </div>
      </main>
    </div>
  );
}
