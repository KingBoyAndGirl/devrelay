'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import ConfirmModal from '@/components/ui/ConfirmModal';

export default function DeleteWorkspaceButton({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    const res = await fetch(`/api/workspaces/${slug}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('空间已删除');
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || '删除失败');
    }
  }

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmOpen(true); }}
        className="btn btn-danger btn-sm"
      >
        删除
      </button>
      <ConfirmModal
        open={confirmOpen}
        title="删除空间"
        message={`确定删除空间「${name}」？此操作不可恢复。`}
        confirmLabel="删除"
        variant="danger"
        onConfirm={() => { setConfirmOpen(false); handleDelete(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
