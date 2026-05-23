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
    <div>
      <div className="px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">添加仓库</h1>
      </div>

      <main className="max-w-lg mx-auto p-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {hasGitHubOAuth ? (
          <>
            {/* Primary: OAuth */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
              <h3 className="font-semibold text-lg mb-2">GitHub OAuth 一键授权</h3>
              <p className="text-sm text-gray-500 mb-4">
                授权后自动获取你所有仓库的列表，并批量添加到当前空间，无需手动输入。
              </p>
              <a
                href={`/api/auth/github?workspace=${slug}`}
                className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-lg text-sm hover:bg-gray-800 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                使用 GitHub 授权
              </a>
            </div>

            {/* Secondary: Manual */}
            <details className="bg-white border border-gray-200 rounded-xl">
              <summary className="px-6 py-4 cursor-pointer text-sm text-gray-500 hover:text-gray-700 select-none">
                或手动添加（Personal Access Token）
              </summary>
              <div className="px-6 pb-5">
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
                      GitHub Token（可选）
                    </label>
                    <input
                      type="password"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="ghp_xxxxxxxxxxxx"
                    />
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
            </details>
          </>
        ) : (
          /* No OAuth configured: Show manual form */
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="font-semibold mb-4">添加仓库</h3>
            <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-2 rounded text-xs">
              未配置 GitHub OAuth。如需一键授权功能，请在 .env 中设置 GITHUB_CLIENT_ID 和 GITHUB_CLIENT_SECRET。
            </div>
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
        )}
      </main>
    </div>
  );
}
