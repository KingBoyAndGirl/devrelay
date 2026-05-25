'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, CheckCircle2, XCircle, GitPullRequest, MessageSquare, Info } from 'lucide-react';

interface NotifItem {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  projectId: string | null;
  createdAt: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      setNotifications(data.notifications?.slice(0, 10) || []);
      setUnreadCount(data.unreadCount || 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchNotifications();

    let eventSource: EventSource | null = null;

    function connectSSE() {
      try {
        eventSource = new EventSource('/api/notifications/stream');

        eventSource.addEventListener('connected', () => {});

        eventSource.addEventListener('message', (e) => {
          try {
            const event = JSON.parse(e.data);
            if (event.id) {
              setNotifications(prev => {
                const updated = [{ ...event, isRead: false, createdAt: new Date().toISOString() }, ...prev];
                return updated.slice(0, 10);
              });
              setUnreadCount(prev => prev + 1);
            }
          } catch { /* ignore parse errors */ }
        });

        eventSource.onerror = () => {
          eventSource?.close();
          eventSource = null;
          const interval = setInterval(fetchNotifications, 30000);
          return () => clearInterval(interval);
        };
      } catch {
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
      }
    }

    const cleanup = connectSSE();

    return () => {
      eventSource?.close();
      if (typeof cleanup === 'function') cleanup();
    };
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    setUnreadCount(0);
    setNotifications(notifications.map(n => ({ ...n, isRead: true })));
  }

  const typeIcons: Record<string, { icon: typeof CheckCircle2; color: string }> = {
    stage_approved: { icon: CheckCircle2, color: 'text-green-500' },
    stage_rejected: { icon: XCircle, color: 'text-red-500' },
    task_assigned: { icon: Info, color: 'text-blue-500' },
    pr_opened: { icon: GitPullRequest, color: 'text-purple-500' },
    comment: { icon: MessageSquare, color: 'text-gray-500' },
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell size={18} className="text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-sm">通知</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">
                全部已读
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">暂无通知</div>
            ) : (
              notifications.map(n => {
                const typeInfo = typeIcons[n.type];
                const TypeIcon = typeInfo?.icon || Info;
                return (
                  <div
                    key={n.id}
                    className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${!n.isRead ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <TypeIcon size={16} className={`mt-0.5 ${typeInfo?.color || 'text-gray-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{n.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('zh-CN')}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
