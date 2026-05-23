'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  projectId: string | null;
  stageId: string | null;
  taskId: string | null;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  stage_approved: 'OK',
  stage_rejected: 'XX',
  task_assigned: '>>',
  pr_opened: '<>',
  comment: '::',
  deployment_started: '>>',
  deployment_completed: 'OK',
};

export default function NotificationsPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => { fetchNotifications(); }, []);

  async function fetchNotifications() {
    const res = await fetch('/api/notifications');
    const data = await res.json();
    setNotifications(data.notifications || []);
    setUnreadCount(data.unreadCount || 0);
    setLoading(false);
  }

  async function markRead(id: string) {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }

  function handleClick(n: Notification) {
    if (!n.isRead) markRead(n.id);
    if (n.taskId && n.projectId) {
      router.push(`/workspaces/${slug}/projects/${n.projectId}/tasks/${n.taskId}`);
    } else if (n.projectId) {
      router.push(`/workspaces/${slug}/projects/${n.projectId}`);
    }
  }

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.isRead)
    : notifications;

  return (
    <div>
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">通知</h1>
          <div className="flex gap-1">
            {(['all', 'unread'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-2 py-1 rounded ${
                  filter === f ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {f === 'all' ? '全部' : `未读 (${unreadCount})`}
              </button>
            ))}
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-sm text-blue-600 hover:underline"
          >
            全部已读
          </button>
        )}
      </div>

      <main className="max-w-3xl mx-auto p-6">
        {loading ? (
          <p className="text-gray-500 text-center py-10">加载中...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg mb-2">
              {filter === 'unread' ? '没有未读通知' : '暂无通知'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(n => (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={`bg-white border rounded-xl p-4 cursor-pointer transition-colors hover:border-blue-300 ${
                  !n.isRead ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-sm mt-0.5 font-mono">{TYPE_ICONS[n.type] || 'o'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-sm ${!n.isRead ? 'font-semibold' : 'font-medium'}`}>
                        {n.title}
                      </h3>
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-gray-400">
                        {new Date(n.createdAt).toLocaleString('zh-CN')}
                      </span>
                      {n.projectId && (
                        <span className="text-xs text-blue-500">查看详情 →</span>
                      )}
                    </div>
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
