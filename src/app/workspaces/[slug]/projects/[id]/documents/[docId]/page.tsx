'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface DocWithContent {
  id: string;
  title: string;
  type: string;
  version: number;
  filePath: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export default function DocumentEditorPage() {
  const routeParams = useParams();
  const slug = routeParams.slug as string;
  const projectId = routeParams.id as string;
  const docId = routeParams.docId as string;

  const [doc, setDoc] = useState<DocWithContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    fetch(`/api/documents/${docId}`)
      .then(r => r.json())
      .then(data => {
        setDoc(data);
        setTitle(data.title);
        setContent(data.content || '');
        setLoading(false);
      });
  }, [docId]);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/documents/${docId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    });
    if (res.ok) {
      setDoc({ ...doc!, title, content, updatedAt: new Date().toISOString() });
      setEditing(false);
    }
    setSaving(false);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">加载中...</p></div>;
  if (!doc) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">文档未找到</p></div>;

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/workspaces/${slug}/projects/${projectId}/documents`} className="text-gray-500 hover:text-gray-700">&larr; 文档列表</Link>
          <div>
            {editing ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-xl font-bold px-2 py-1 border border-gray-300 rounded"
              />
            ) : (
              <h1 className="text-xl font-bold">{doc.title}</h1>
            )}
            <p className="text-xs text-gray-400">v{doc.version} · {doc.type}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={() => setPreview(!preview)}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {preview ? '编辑' : '预览'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
              <button
                onClick={() => { setEditing(false); setContent(doc.content || ''); setTitle(doc.title); }}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs hover:bg-blue-700"
            >
              编辑
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {editing && !preview ? (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full min-h-[60vh] px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm leading-relaxed"
            placeholder="输入 Markdown 内容..."
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-6 prose prose-sm max-w-none">
            {content ? (
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
            ) : (
              <p className="text-gray-400">文档内容为空</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Simple Markdown renderer (headers, bold, italic, code, lists, links)
function renderMarkdown(md: string): string {
  let html = md
    // Escape HTML
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-6 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:underline">$1</a>')
    // Unordered lists
    .replace(/^\- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Line breaks
    .replace(/\n\n/g, '</p><p class="mb-3">')
    .replace(/\n/g, '<br/>');

  return `<p class="mb-3">${html}</p>`;
}
