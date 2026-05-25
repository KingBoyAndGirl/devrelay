'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import { WorkspaceNav } from './nav-client';

export function SidebarClient({
  slug,
  workspaceName,
  agentPanel,
  userInfo,
  onMobileToggle,
}: {
  slug: string;
  workspaceName: string;
  agentPanel?: React.ReactNode;
  userInfo?: React.ReactNode;
  onMobileToggle?: (open: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed');
    if (stored === 'true') setCollapsed(true);
    setMounted(true);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
  }

  function openMobile() {
    setMobileOpen(true);
    onMobileToggle?.(true);
  }

  function closeMobile() {
    setMobileOpen(false);
    onMobileToggle?.(false);
  }

  // Expose openMobile to parent via a global event
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__sidebarOpenMobile = openMobile;
    }
    return () => { delete (window as any).__sidebarOpenMobile; };
  }, []);

  if (!mounted) {
    return (
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0" />
    );
  }

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Mobile hamburger — fixed position top-left */}
      <button
        onClick={openMobile}
        className="md:hidden fixed top-0 left-0 z-30 p-3 text-gray-500 hover:text-gray-700"
        aria-label="打开菜单"
      >
        <Menu size={20} />
      </button>

      {/* Sidebar */}
      <aside
        className={`bg-white border-r border-gray-200 flex flex-col shrink-0 transition-all duration-200
          ${collapsed ? 'w-16' : 'w-56'}
          max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:shadow-xl max-md:transition-transform
          ${mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'}`}
      >
        {/* Header */}
        <div className={`px-3 py-4 border-b border-gray-100 flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <Link href="/" className="text-xs text-gray-500 hover:text-gray-700 block mb-1 truncate">&larr; 空间列表</Link>
              <h1 className="font-bold text-sm truncate" title={workspaceName}>{workspaceName}</h1>
            </div>
          ) : (
            <h1 className="font-bold text-xs truncate" title={workspaceName}>
              {workspaceName.slice(0, 2)}
            </h1>
          )}
          <button
            onClick={closeMobile}
            className="md:hidden text-gray-400 hover:text-gray-600 ml-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Agent activity panel (hidden when collapsed) */}
        {!collapsed && agentPanel && (
          <div className="px-3 py-2">{agentPanel}</div>
        )}

        {/* Navigation */}
        <WorkspaceNav slug={slug} collapsed={collapsed} />

        {/* Bottom section */}
        <div className="mt-auto">
          {!collapsed && userInfo && (
            <div className="px-3 py-3 border-t border-gray-100 text-xs text-gray-400 space-y-1">
              {userInfo}
            </div>
          )}

          {/* Collapse toggle (desktop only) */}
          <button
            onClick={toggle}
            className="hidden md:flex w-full items-center justify-center py-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </aside>
    </>
  );
}
