'use client';

import { useEffect, useCallback } from 'react';

interface Shortcut {
  key: string;
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  { key: '?', description: '显示/隐藏此帮助' },
  { key: 'A', description: '通过当前阶段' },
  { key: 'R', description: '驳回当前阶段' },
  { key: 'J', description: '下一个阶段' },
  { key: 'K', description: '上一个阶段' },
  { key: 'N', description: '聚焦评论输入' },
];

export function KeyboardShortcuts({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, [open, handleKey]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-sm p-6 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">键盘快捷键</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            ✕
          </button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map(s => (
            <div key={s.key} className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{s.description}</span>
              <kbd className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded border border-gray-300 bg-gray-50 text-xs font-mono font-medium text-gray-700 shadow-sm">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
          仅在项目流程页面可用，输入框聚焦时快捷键不生效
        </p>
      </div>
    </div>
  );
}
