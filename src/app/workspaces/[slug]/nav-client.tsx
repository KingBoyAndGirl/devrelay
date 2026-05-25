'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderGit2,
  FolderKanban,
  Bot,
  Bell,
  Settings,
} from 'lucide-react';
import NotificationNavBadge from '@/components/notifications/NotificationNavBadge';

const NAV_ITEMS = [
  { href: '', label: '概览', icon: LayoutDashboard },
  { href: '/repos', label: '仓库', icon: FolderGit2 },
  { href: '/projects', label: '项目', icon: FolderKanban },
  { href: '/agents', label: 'Agent', icon: Bot },
  { href: '/notifications', label: '通知', icon: Bell, badge: true },
  { href: '/settings', label: '设置', icon: Settings },
];

export function WorkspaceNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/workspaces/${slug}`;

  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5">
      {NAV_ITEMS.map((item) => {
        const href = item.href ? `${base}${item.href}` : base;
        const active = item.href === ''
          ? pathname === href
          : pathname.startsWith(href);

        const Icon = item.icon;

        return (
          <Link
            key={item.label}
            href={href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors relative ${
              active
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-blue-600 rounded-r-full" />
            )}
            <Icon size={16} className={active ? 'text-blue-600' : 'text-gray-400'} />
            <span>{item.label}</span>
            {item.badge && <NotificationNavBadge />}
          </Link>
        );
      })}
    </nav>
  );
}
