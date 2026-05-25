'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ListSkeleton } from '@/components/ui/SkeletonLoader';

interface RepoItem {
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
  alreadyAdded: boolean;
}

export default function SelectReposPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const tokenId = searchParams.get('token_id') || '';

  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchRepos = useCallback(async () => {
    if (!tokenId) return;
    try {
      const res = await fetch(`/api/workspaces/${slug}/repos/github-list?token_id=${tokenId}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load repos');
        setLoading(false);
        return;
      }
      const data: RepoItem[] = await res.json();
      setRepos(data);
    } catch {
      setError('Network error');
    }
    setLoading(false);
  }, [slug, tokenId]);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  function toggleRepo(fullName: string) {
    const next = new Set(selected);
    if (next.has(fullName)) {
      next.delete(fullName);
    } else {
      next.add(fullName);
    }
    setSelected(next);
  }

  function toggleAll() {
    const selectable = repos.filter((r) => !r.alreadyAdded);
    if (selectable.every((r) => selected.has(r.fullName))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectable.map((r) => r.fullName)));
    }
  }

  async function handleImport() {
    const toImport = Array.from(selected).filter((name) => {
      const repo = repos.find((r) => r.fullName === name);
      return repo && !repo.alreadyAdded;
    });

    if (toImport.length === 0) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/workspaces/${slug}/repos/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId, repoFullNames: toImport }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/workspaces/${slug}/repos?added=${data.added}`);
      } else {
        const data = await res.json();
        setError(data.error || 'Import failed');
      }
    } catch {
      setError('Network error');
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6 py-20">
        <ListSkeleton count={5} />
      </div>
    );
  }

  if (error && repos.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      </div>
    );
  }

  const selectableRepos = repos.filter((r) => !r.alreadyAdded);
  const alreadyAddedRepos = repos.filter((r) => r.alreadyAdded);
  const allSelected = selectableRepos.length > 0 && selectableRepos.every((r) => selected.has(r.fullName));

  return (
    <div>
      <div className="px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">选择要导入的仓库</h1>
      </div>

      <main className="max-w-2xl mx-auto p-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {selectableRepos.length} 个可选仓库
            </span>
            {selectableRepos.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {allSelected ? '取消全选' : '全选'}
              </button>
            )}
          </div>

          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {selectableRepos.map((repo) => (
              <label
                key={repo.fullName}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.has(repo.fullName)}
                  onChange={() => toggleRepo(repo.fullName)}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-sm truncate block">{repo.fullName}</span>
                  <span className="text-xs text-gray-400">{repo.defaultBranch}</span>
                </span>
                {repo.private && (
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">私有</span>
                )}
              </label>
            ))}

            {alreadyAddedRepos.length > 0 && (
              <div className="border-t border-gray-200">
                <div className="px-4 py-2 text-xs text-gray-400">已添加</div>
                {alreadyAddedRepos.map((repo) => (
                  <div
                    key={repo.fullName}
                    className="flex items-center gap-3 px-4 py-2.5 opacity-50"
                  >
                    <input
                      type="checkbox"
                      checked
                      disabled
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-sm truncate block">{repo.fullName}</span>
                      <span className="text-xs text-gray-400">{repo.defaultBranch}</span>
                    </span>
                    <span className="text-xs text-gray-400">已添加</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => router.push(`/workspaces/${slug}/repos`)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={submitting || selected.size === 0}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting
              ? '导入中...'
              : `导入选中仓库 (${Array.from(selected).filter((n) => !repos.find((r) => r.fullName === n)?.alreadyAdded).length})`}
          </button>
        </div>
      </main>
    </div>
  );
}
