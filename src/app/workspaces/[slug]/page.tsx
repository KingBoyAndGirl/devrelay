'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Stats {
  projectCount: number;
  agentCount: number;
  repoCount: number;
  memberCount: number;
  workspaceName: string;
}

export default function WorkspacePage() {
  const params = useParams();
  const slug = params.slug as string;
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    async function load() {
      const [wsRes, projectsRes, agentsRes] = await Promise.all([
        fetch(`/api/workspaces/${slug}`),
        fetch(`/api/workspaces/${slug}/projects`),
        fetch(`/api/workspaces/${slug}/agents`),
      ]);

      const ws = await wsRes.json();
      const projects = await projectsRes.json();
      const agents = await agentsRes.json();

      setStats({
        workspaceName: ws.name,
        projectCount: Array.isArray(projects) ? projects.length : 0,
        agentCount: Array.isArray(agents) ? agents.filter((a: any) => a.enabled).length : 0,
        repoCount: ws.repositories?.length || 0,
        memberCount: ws.members?.length || 0,
      });
    }
    load();
  }, [slug]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-lg font-semibold mb-6">
        {stats ? `${stats.workspaceName} 概览` : '概览'}
      </h2>

      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard label="项目" value={stats.projectCount} href={`/workspaces/${slug}/projects`} />
          <StatCard label="Agent" value={stats.agentCount} href={`/workspaces/${slug}/agents`} />
          <StatCard label="仓库" value={stats.repoCount} href={`/workspaces/${slug}/repos`} />
          <StatCard label="成员" value={stats.memberCount} href={`/workspaces/${slug}/settings`} />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link
          href={`/workspaces/${slug}/repos`}
          className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
        >
          <h3 className="font-semibold">仓库</h3>
          <p className="text-sm text-gray-500 mt-1">管理 GitHub 仓库连接</p>
        </Link>
        <Link
          href={`/workspaces/${slug}/projects`}
          className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
        >
          <h3 className="font-semibold">项目</h3>
          <p className="text-sm text-gray-500 mt-1">管理交付项目和流程</p>
        </Link>
        <Link
          href={`/workspaces/${slug}/agents`}
          className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
        >
          <h3 className="font-semibold">Agent</h3>
          <p className="text-sm text-gray-500 mt-1">管理 AI 智能体</p>
        </Link>
        <Link
          href={`/workspaces/${slug}/settings`}
          className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
        >
          <h3 className="font-semibold">设置</h3>
          <p className="text-sm text-gray-500 mt-1">空间设置与成员管理</p>
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow text-center"
    >
      <div className="text-2xl font-bold text-blue-600">{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </Link>
  );
}
