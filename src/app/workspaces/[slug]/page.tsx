'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FolderGit2, Bot, Database, Users, Plus, ArrowRight, Bell } from 'lucide-react';
import { ListSkeleton } from '@/components/ui/SkeletonLoader';

interface Stats {
  workspaceName: string;
  projectCount: number;
  agentCount: number;
  repoCount: number;
  memberCount: number;
}

interface RecentProject {
  id: string;
  name: string;
  status: string;
  stages: Array<{ step: number; name: string; status: string }>;
  updatedAt: string;
}

export default function WorkspacePage() {
  const params = useParams();
  const slug = params.slug as string;
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [activeProjects, setActiveProjects] = useState<RecentProject[]>([]);
  const [loading, setLoading] = useState(true);

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

      if (Array.isArray(projects)) {
        const sorted = projects.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        setRecentProjects(sorted.slice(0, 4));
        setActiveProjects(sorted.filter((p: any) => p.status === 'active'));
      }

      setLoading(false);
    }
    load();
  }, [slug]);

  function progress(stages: RecentProject['stages']) {
    const done = stages.filter(s => s.status === 'completed').length;
    return stages.length ? Math.round((done / stages.length) * 100) : 0;
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <ListSkeleton count={5} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold">
          {stats ? `${stats.workspaceName} 概览` : '概览'}
        </h2>
        <div className="flex gap-2">
          <Link href={`/workspaces/${slug}/projects/new`} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> 新建项目
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="项目"
            value={stats.projectCount}
            href={`/workspaces/${slug}/projects`}
            icon={<FolderGit2 className="w-5 h-5" />}
            color="blue"
          />
          <StatCard
            label="Agent"
            value={stats.agentCount}
            href={`/workspaces/${slug}/agents`}
            icon={<Bot className="w-5 h-5" />}
            color="green"
          />
          <StatCard
            label="仓库"
            value={stats.repoCount}
            href={`/workspaces/${slug}/repos`}
            icon={<Database className="w-5 h-5" />}
            color="purple"
          />
          <StatCard
            label="成员"
            value={stats.memberCount}
            href={`/workspaces/${slug}/settings`}
            icon={<Users className="w-5 h-5" />}
            color="amber"
          />
        </div>
      )}

      {/* Pipeline Health */}
      {activeProjects.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800">交付总览</h3>
            <span className="text-xs text-gray-400">{activeProjects.length} 个活跃项目</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeProjects.map(p => {
              const doneCount = p.stages.filter(s => s.status === 'completed').length;
              const progress = p.stages.length ? Math.round((doneCount / p.stages.length) * 100) : 0;
              const activeStage = p.stages.find(s => s.status === 'in_progress');
              return (
                <Link
                  key={p.id}
                  href={`/workspaces/${slug}/projects/${p.id}`}
                  className="card-hover p-4 block"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-sm truncate">{p.name}</h4>
                    <span className="text-xs text-gray-400">
                      {new Date(p.updatedAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                  {/* Mini dots */}
                  <div className="flex items-center gap-1 mb-2">
                    {p.stages.map(s => (
                      <span
                        key={s.step}
                        title={`${s.step}. ${s.name}: ${s.status}`}
                        className={`w-2 h-2 rounded-full ${
                          s.status === 'completed' ? 'bg-green-500' :
                          s.status === 'in_progress' ? 'bg-blue-500 ring-1 ring-blue-300' :
                          s.status === 'rejected' ? 'bg-red-500' :
                          'bg-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {activeStage ? `${activeStage.step}. ${activeStage.name}` : '暂无进行中阶段'}
                    </span>
                    <span className="text-xs font-medium text-gray-700">{progress}%</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent projects */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">最近项目</h3>
            <Link href={`/workspaces/${slug}/projects`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              查看全部 <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {recentProjects.length === 0 ? (
            <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
              <FolderGit2 className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-3">还没有项目</p>
              <Link href={`/workspaces/${slug}/projects/new`} className="text-sm text-blue-600 hover:underline">
                创建第一个项目
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentProjects.map(p => (
                <Link
                  key={p.id}
                  href={`/workspaces/${slug}/projects/${p.id}`}
                  className="card-hover p-4 block"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold">{p.name}</h4>
                      <span className={`text-xs ${
                        p.status === 'active' ? 'text-green-600' :
                        p.status === 'completed' ? 'text-blue-600' : 'text-gray-400'
                      }`}>
                        {p.status === 'active' ? '进行中' : p.status === 'completed' ? '已完成' : '已归档'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {new Date(p.updatedAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${progress(p.stages)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 font-mono">{progress(p.stages)}%</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick links sidebar */}
        <div>
          <h3 className="font-semibold text-gray-800 mb-4">快捷入口</h3>
          <div className="space-y-2">
            <QuickLink
              href={`/workspaces/${slug}/repos`}
              icon={<Database className="w-4 h-4" />}
              label="仓库管理"
              desc="关联 GitHub 仓库"
            />
            <QuickLink
              href={`/workspaces/${slug}/agents`}
              icon={<Bot className="w-4 h-4" />}
              label="Agent 管理"
              desc="管理 AI 智能体"
            />
            <QuickLink
              href={`/workspaces/${slug}/settings`}
              icon={<Users className="w-4 h-4" />}
              label="空间设置"
              desc="成员与基本设置"
            />
            <QuickLink
              href={`/workspaces/${slug}/notifications`}
              icon={<Bell className="w-4 h-4" />}
              label="通知"
              desc="查看系统通知"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, href, icon, color }: {
  label: string; value: number; href: string; icon: React.ReactNode; color: string;
}) {
  const bgMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <Link href={href} className="card-hover p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgMap[color] || bgMap.blue}`}>
          {icon}
        </div>
        <div>
          <div className="text-xl font-bold text-gray-900">{value}</div>
          <div className="text-xs text-gray-500">{label}</div>
        </div>
      </div>
    </Link>
  );
}

function QuickLink({ href, icon, label, desc }: {
  href: string; icon: React.ReactNode; label: string; desc: string;
}) {
  return (
    <Link href={href} className="card-hover p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
        {icon}
      </div>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-gray-400">{desc}</div>
      </div>
    </Link>
  );
}
