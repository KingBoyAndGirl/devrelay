'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { config } from '@/lib/config';

export default function NewRepoPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasGitHubOAuth = !!config.github.clientId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch(`/api/workspaces/${slug}/repos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, repo, accessToken: accessToken || undefined }),
    });

    if (res.ok) {
      router.push(`/workspaces/${slug}/repos`);
    } else {
      const data = await res.json();
      setError(data.error || '添加失败');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href={`/workspaces/${slug}/repos`} className="text-gray-500 hover:text-gray-700">&larr; 返回仓库列表</Link>
        <h1 className="text-xl font-bold">添加仓库</h1>
      </header>

      <main className="max-w-lg mx-auto p-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {hasGitHubOAuth && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h3 className="font-semibold text-blue-800">推荐：GitHub OAuth 授权</h3>
            <p className="text-sm text-blue-600 mt-1 mb-3">通过 GitHub OAuth 授权，自动获取仓库列表和访问权限。</p>
            <a
              href={`/api/auth/github?workspace=${slug}`}
              className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
            >
              使用 GitHub 授权
            </a>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold mb-4">手动添加（Personal Access Token）</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">仓库所有者 (owner)</label>
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例如：octocat"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">仓库名称 (repo)</label>
              <input
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例如：hello-world"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                GitHub Token（可选，留空则仅记录仓库信息）
              </label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ghp_xxxxxxxxxxxx"
              />
              <p className="text-xs text-gray-400 mt-1">
                Token 需要 repo、workflow 和 admin:repo_hook 权限
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? '添加中...' : '添加仓库'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
