'use client';

import { Search } from 'lucide-react';

export function SearchTrigger() {
  function openSearch() {
    // Dispatch a custom event that GlobalSearch listens for
    window.dispatchEvent(new CustomEvent('open-global-search'));
  }

  return (
    <button
      onClick={openSearch}
      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:text-gray-600 hover:border-gray-300 transition-colors"
    >
      <Search size={14} />
      <span className="hidden sm:inline">搜索...</span>
      <kbd className="hidden sm:inline-flex items-center text-xs text-gray-400">Ctrl+K</kbd>
    </button>
  );
}
