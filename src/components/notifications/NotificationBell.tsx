'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

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

    // SSE for real-time updates
    let eventSource: EventSource | null = null;

    function connectSSE() {
      try {
        eventSource = new EventSource('/api/notifications/stream');

        eventSource.addEventListener('connected', () => {
          // Connection established
        });

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
          // Fall back to polling
          const interval = setInterval(fetchNotifications, 30000);
          return () => clearInterval(interval);
        };
      } catch {
        // SSE not available, use polling
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

  const typeIcons: Record<string, string> = {
    stage_approved: 'OK',
    stage_rejected: 'XX',
    task_assigned: '>>',
    pr_opened: '<>',
    comment: '::',
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
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
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${!n.isRead ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm mt-0.5">{typeIcons[n.type] || 'o'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('zh-CN')}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
