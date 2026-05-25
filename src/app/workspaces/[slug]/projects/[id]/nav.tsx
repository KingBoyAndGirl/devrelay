'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '', label: 'Issue 看板', pattern: /^\/workspaces\/[^/]+\/projects\/[^/]+$/ },
  { href: 'dashboard', label: '概览', pattern: /\/dashboard/ },
  { href: 'tasks', label: '任务', pattern: /\/tasks/ },
  { href: 'documents', label: '文档', pattern: /\/documents/ },
  { href: 'prs', label: 'PR', pattern: /\/prs/ },
  { href: 'issues', label: 'Issues', pattern: /\/issues/ },
];

export default function ProjectNav({ slug, id }: { slug: string; id: string }) {
  const pathname = usePathname();
  const base = `/workspaces/${slug}/projects/${id}`;

  return (
    <nav className="flex gap-1 px-6 pb-1">
      {TABS.map(tab => {
        const href = tab.href ? `${base}/${tab.href}` : base;
        const active = tab.pattern.test(pathname);
        return (
          <Link
            key={tab.label}
            href={href}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              active
                ? 'bg-blue-100 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
