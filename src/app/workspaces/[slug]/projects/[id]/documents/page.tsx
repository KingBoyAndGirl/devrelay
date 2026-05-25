'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { FileText } from 'lucide-react';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { ListSkeleton } from '@/components/ui/SkeletonLoader';

interface Doc {
  id: string;
  title: string;
  type: string;
  version: number;
  filePath: string;
  createdAt: string;
  updatedAt: string;
}

const DOC_TYPES: Record<string, string> = {
  prd: 'PRD',
  prototype: '原型设计',
  tech_design: '技术方案',
  code_review_report: '代码评审报告',
  test_plan: '测试计划',
  test_report: '测试报告',
  acceptance_report: '验收报告',
  deployment_log: '部署日志',
};

export default function DocumentsPage() {
  const routeParams = useParams();
  const slug = routeParams.slug as string;
  const id = routeParams.id as string;

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('prd');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<string | null>(null);

  useEffect(() => { fetchDocs(); }, [id]);

  async function fetchDocs() {
    const res = await fetch(`/api/projects/${id}/documents`);
    setDocs(await res.json());
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/projects/${id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, type: docType, content }),
    });
    if (res.ok) {
      setShowNew(false);
      setTitle('');
      setContent('');
      fetchDocs();
    }
    setSaving(false);
  }

  async function handleDelete(docId: string) {
    await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
    toast.success('文档已删除');
    fetchDocs();
  }

  return (
    <>
      <div className="px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">文档中心</h1>
        <button
          onClick={() => setShowNew(!showNew)}
          className="btn-primary"
        >
          {showNew ? '取消' : '新建文档'}
        </button>
      </div>

      <main className="max-w-6xl mx-auto p-6">
        {showNew && (
          <form onSubmit={handleCreate} className="card p-5 mb-6 space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">文档标题</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input"
                  placeholder="例如：v2.0 PRD"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">文档类型</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="select"
                >
                  {Object.entries(DOC_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">内容（Markdown）</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                rows={8}
                placeholder="输入 Markdown 内容..."
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
            >
              {saving ? '创建中...' : '创建文档'}
            </button>
          </form>
        )}

        {loading ? (
          <ListSkeleton count={5} />
        ) : docs.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-lg mb-2">还没有文档</p>
            <p className="text-sm">创建 PRD、技术方案、测试报告等文档</p>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <div key={doc.id} className="card p-5 flex items-center justify-between">
                <Link href={`/workspaces/${slug}/projects/${id}/documents/${doc.id}`} className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="badge-primary">{DOC_TYPES[doc.type] || doc.type}</span>
                    <div>
                      <h3 className="font-semibold hover:text-blue-600">{doc.title}</h3>
                      <p className="text-xs text-gray-400">
                        v{doc.version} · 更新于 {new Date(doc.updatedAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => setConfirmDeleteDoc(doc.id)}
                  className="text-xs text-red-500 hover:text-red-700 px-2"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
      <ConfirmModal
        open={confirmDeleteDoc !== null}
        title="删除文档"
        message="确定删除此文档？"
        confirmLabel="删除"
        variant="danger"
        onConfirm={() => { const id = confirmDeleteDoc!; setConfirmDeleteDoc(null); handleDelete(id); }}
        onCancel={() => setConfirmDeleteDoc(null)}
      />
    </>
  );
}
