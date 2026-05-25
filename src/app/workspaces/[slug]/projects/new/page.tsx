'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';

interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  taskCount: number;
}

export default function NewProjectPage() {
  const router = useRouter();
  const routeParams = useParams();
  const slug = routeParams.slug as string;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customer, setCustomer] = useState('');
  const [template, setTemplate] = useState('empty');
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/templates')
      .then(r => r.json())
      .then(data => setTemplates(data))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);


    const res = await fetch(`/api/workspaces/${slug}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, customer: customer || null, template }),
    });

    if (res.ok) {
      const data = await res.json();
      toast.success('项目创建成功');
      router.push(`/workspaces/${slug}/projects/${data.id}`);
    } else {
      const data = await res.json();
      toast.error(data.error || '创建失败');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href={`/workspaces/${slug}/projects`} className="text-gray-500 hover:text-gray-700">&larr; 返回项目列表</Link>
        <h1 className="text-xl font-bold">新建项目</h1>
      </header>
      <main className="max-w-2xl mx-auto p-6">
        <form onSubmit={handleSubmit} className="card p-5 space-y-4">
          {/* Template selector */}
          {templates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">项目模板（可选）</label>
              <div className="grid grid-cols-2 gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplate(t.id)}
                    className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                      template === t.id
                        ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                    {t.taskCount > 0 && (
                      <p className="text-xs text-blue-600 mt-1">{t.taskCount} 个预置任务</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">项目名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="例如：v2.0 交付"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">客户名称（可选）</label>
              <input
                type="text"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                className="input"
                placeholder="客户公司名称"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述（可选）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              rows={3}
              placeholder="项目目标与范围"
            />
          </div>
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
              {loading ? '创建中...' : '创建项目'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
