'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FolderKanban, Bot, ArrowRight } from 'lucide-react';

interface SearchResult {
  type: 'project' | 'agent';
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  href: string;
}

interface GlobalSearchProps {
  slug: string;
}

export function GlobalSearch({ slug }: GlobalSearchProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [allData, setAllData] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global Ctrl+K listener + custom event
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(prev => {
          if (!prev) {
            setQuery('');
            setSelectedIdx(0);
            return true;
          }
          return false;
        });
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }

    function handleCustomOpen() {
      setOpen(true);
      setQuery('');
      setSelectedIdx(0);
    }

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-global-search', handleCustomOpen);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-global-search', handleCustomOpen);
    };
  }, [open]);

  // Fetch data when opened
  useEffect(() => {
    if (!open || allData.length > 0) return;
    async function fetchData() {
      try {
        const [projectsRes, agentsRes] = await Promise.all([
          fetch(`/api/workspaces/${slug}/projects`),
          fetch(`/api/workspaces/${slug}/agents`),
        ]);
        const projects = await projectsRes.json();
        const agents = await agentsRes.json();

        const items: SearchResult[] = [];

        if (Array.isArray(projects)) {
          for (const p of projects) {
            items.push({
              type: 'project',
              id: p.id,
              title: p.name,
              subtitle: p.status === 'active' ? '进行中' : p.status === 'completed' ? '已完成' : '已归档',
              href: `/workspaces/${slug}/projects/${p.id}`,
            });
          }
        }

        if (Array.isArray(agents)) {
          for (const a of agents) {
            items.push({
              type: 'agent',
              id: a.id,
              title: a.name,
              subtitle: a.type,
              badge: a.enabled ? '已启用' : '已禁用',
              href: `/workspaces/${slug}/agents`,
            });
          }
        }

        setAllData(items);
      } catch {}
    }
    fetchData();
    // Focus input on open
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter results
  useEffect(() => {
    if (!query.trim()) {
      setResults(allData.slice(0, 8));
      return;
    }
    const q = query.toLowerCase();
    const filtered = allData.filter(
      r => r.title.toLowerCase().includes(q) || r.subtitle?.toLowerCase().includes(q)
    );
    setResults(filtered.slice(0, 8));
    setSelectedIdx(0);
  }, [query, allData]);

  // Keyboard navigation within modal
  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIdx]) {
        setOpen(false);
        router.push(results[selectedIdx].href);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }, [results, selectedIdx, router]);

  if (!open) return null;

  const typeIcon = (type: string) => {
    switch (type) {
      case 'project': return <FolderKanban size={16} className="text-blue-500" />;
      case 'agent': return <Bot size={16} className="text-green-500" />;
      default: return <Search size={16} className="text-gray-400" />;
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'project': return '项目';
      case 'agent': return 'Agent';
      default: return type;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search size={18} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="搜索项目、Agent..."
            className="flex-1 text-sm outline-none text-gray-900 placeholder-gray-400 bg-transparent"
          />
          <kbd className="text-xs text-gray-400">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              {query ? '无匹配结果' : '正在加载...'}
            </div>
          ) : (
            <div className="py-2">
              {results.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => { setOpen(false); router.push(r.href); }}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === selectedIdx ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    {typeIcon(r.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{r.title}</div>
                    <div className="text-xs text-gray-400">{r.subtitle}</div>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                    {typeLabel(r.type)}
                  </span>
                  {i === selectedIdx && (
                    <ArrowRight size={14} className="text-gray-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-3 text-xs text-gray-400">
          <span><kbd>↑↓</kbd> 导航</span>
          <span><kbd>Enter</kbd> 跳转</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  );
}
