'use client';

import { useRouter } from 'next/navigation';

export default function DeleteWorkspaceButton({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`确定删除空间「${name}」？此操作不可恢复。`)) return;

    const res = await fetch(`/api/workspaces/${slug}`, { method: 'DELETE' });
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '删除失败');
    }
  }

  return (
    <button
      onClick={handleDelete}
      className="px-2.5 py-1 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
    >
      删除
    </button>
  );
}
