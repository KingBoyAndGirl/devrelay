'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  Clock, AlertTriangle, Bot, GitPullRequest, Rocket,
  Bug, BarChart3, Timer, CheckCircle2, Circle,
  PlayCircle, TrendingUp
} from 'lucide-react';
import { DetailSkeleton } from '@/components/ui/SkeletonLoader';

interface DashboardData {
  progress: number;
  totalStages: number;
  doneStages: number;
  remainingStages: number;
  cycleTimes: { step: number; name: string; hours: number }[];
  avgCycleHours: number;
  estimatedHours: number;
  bottlenecks: {
    rejected: { step: number; name: string; reviewNotes: string | null }[];
    slow: { step: number; name: string; hours: number }[];
  };
  agentStats: { agentId: string; agentName: string; taskCount: number; completedTasks: number }[];
  prCount: number;
  mergedPRCount: number;
  recentPRCount: number;
  weeklyPRs: number;
  deploymentCount: number;
  successfulDeployCount: number;
  recentDeployCount: number;
  weeklyDeploys: number;
  feedbackCount: number;
  bugCount: number;
  openBugCount: number;
  recentFeedback: { id: string; type: string; title: string; severity: string; status: string }[];
  recentActivities: { id: string; actorName: string | null; action: string; target: string | null; createdAt: string }[];
  agentCount: number;
  taskStats: { total: number; todo: number; inProgress: number; done: number };
}

export default function DashboardPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/projects/${id}/dashboard`);
      setData(await res.json());
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <DetailSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <p className="text-gray-500">无法加载仪表盘数据</p>
      </div>
    );
  }

  function formatHours(h: number): string {
    if (h >= 24) return `${Math.round(h / 24)} 天`;
    return `${h} 小时`;
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          icon={<BarChart3 className="w-5 h-5" />}
          label="完成进度"
          value={`${data.progress}%`}
          sub={`${data.doneStages}/${data.totalStages} 阶段`}
          color="blue"
        />
        <MetricCard
          icon={<Timer className="w-5 h-5" />}
          label="平均周期"
          value={formatHours(data.avgCycleHours)}
          sub={data.remainingStages > 0 ? `预计剩余 ${formatHours(data.estimatedHours)}` : '全部完成'}
          color="amber"
        />
        <MetricCard
          icon={<GitPullRequest className="w-5 h-5" />}
          label="PR 频率"
          value={`${data.weeklyPRs}/周`}
          sub={`${data.mergedPRCount} 已合并 / ${data.prCount} 总计`}
          color="green"
        />
        <MetricCard
          icon={<Rocket className="w-5 h-5" />}
          label="部署频率"
          value={`${data.weeklyDeploys}/周`}
          sub={`${data.successfulDeployCount} 成功 / ${data.deploymentCount} 总计`}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Progress & cycle time */}
        <div className="card p-5">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <Timer className="w-4 h-4" /> 阶段周期分析
          </h3>
          {data.cycleTimes.length > 0 ? (
            <div className="space-y-2">
              {data.cycleTimes.map(c => {
                const maxH = Math.max(...data.cycleTimes.map(x => x.hours), 1);
                const pct = Math.round((c.hours / maxH) * 100);
                return (
                  <div key={c.step} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-16 truncate">{c.step}. {c.name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          c.hours > data.avgCycleHours * 1.5 && data.avgCycleHours > 0
                            ? 'bg-amber-400' : 'bg-blue-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                      <span className="absolute inset-0 flex items-center pl-2 text-xs font-medium text-gray-700">
                        {formatHours(c.hours)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">暂无完成阶段数据</p>
          )}
        </div>

        {/* Bottlenecks */}
        <div className="card p-5">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> 瓶颈与风险
          </h3>
          {data.bottlenecks.rejected.length === 0 && data.bottlenecks.slow.length === 0 ? (
            <p className="text-sm text-gray-400">暂无瓶颈检测到</p>
          ) : (
            <div className="space-y-3">
              {data.bottlenecks.rejected.map(s => (
                <div key={s.step} className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-700">
                      阶段 {s.step}. {s.name} — 已驳回
                    </p>
                    {s.reviewNotes && (
                      <p className="text-xs text-red-500 mt-0.5">{s.reviewNotes}</p>
                    )}
                  </div>
                </div>
              ))}
              {data.bottlenecks.slow.map(s => (
                <div key={s.step} className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg">
                  <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-700">
                      阶段 {s.step}. {s.name} — 耗时 {formatHours(s.hours)}
                    </p>
                    <p className="text-xs text-amber-500 mt-0.5">高于平均值 1.5 倍</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Task distribution */}
        <div className="card p-5">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> 任务分布
          </h3>
          <div className="space-y-3">
            <TaskBar
              icon={<Circle className="w-3.5 h-3.5" />}
              label="待开始"
              count={data.taskStats.todo}
              total={data.taskStats.total}
              color="bg-gray-300"
            />
            <TaskBar
              icon={<PlayCircle className="w-3.5 h-3.5" />}
              label="进行中"
              count={data.taskStats.inProgress}
              total={data.taskStats.total}
              color="bg-blue-500"
            />
            <TaskBar
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
              label="已完成"
              count={data.taskStats.done}
              total={data.taskStats.total}
              color="bg-green-500"
            />
          </div>
        </div>

        {/* Agent productivity */}
        <div className="card p-5">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <Bot className="w-4 h-4" /> Agent 产出
          </h3>
          {data.agentStats.length > 0 ? (
            <div className="space-y-3">
              {data.agentStats.map(a => (
                <div key={a.agentId} className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate max-w-[140px]">{a.agentName}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      {a.completedTasks}/{a.taskCount} 任务
                    </span>
                    <div className="w-20 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${a.taskCount ? Math.round((a.completedTasks / a.taskCount) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">暂无 Agent 分配任务</p>
          )}
        </div>

        {/* Bugs */}
        <div className="card p-5">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <Bug className="w-4 h-4" /> Bug 与反馈
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-2 bg-gray-50 rounded-lg">
              <div className="text-xl font-bold text-gray-700">{data.feedbackCount}</div>
              <div className="text-xs text-gray-500">总反馈</div>
            </div>
            <div className="text-center p-2 bg-red-50 rounded-lg">
              <div className="text-xl font-bold text-red-600">{data.bugCount}</div>
              <div className="text-xs text-gray-500">Bug 总计</div>
            </div>
            <div className="text-center p-2 bg-amber-50 rounded-lg">
              <div className="text-xl font-bold text-amber-600">{data.openBugCount}</div>
              <div className="text-xs text-gray-500">待处理</div>
            </div>
          </div>
          {data.recentFeedback.length > 0 && (
            <div className="space-y-1.5">
              {data.recentFeedback.slice(0, 3).map(f => (
                <div key={f.id} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    f.type === 'bug' ? 'bg-red-500' :
                    f.type === 'incident' ? 'bg-orange-500' : 'bg-blue-500'
                  }`} />
                  <span className="truncate">{f.title}</span>
                  <span className={`ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
                    f.severity === 'critical' ? 'bg-red-100 text-red-700' :
                    f.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{f.severity}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="card p-5">
          <h3 className="section-title mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> 最近活动
          </h3>
          {data.recentActivities.length > 0 ? (
            <div className="space-y-2">
              {data.recentActivities.slice(0, 6).map(a => (
                <div key={a.id} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="shrink-0 text-gray-400">
                    {(() => {
                      const d = new Date(a.createdAt);
                      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
                    })()}
                  </span>
                  <span className="font-medium text-gray-700 truncate max-w-[80px]">{a.actorName || '系统'}</span>
                  <span className="text-gray-500 truncate">{a.action}</span>
                  {a.target && <span className="text-gray-400 truncate">{a.target}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">暂无活动记录</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.blue}`}>
          {icon}
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
    </div>
  );
}

function TaskBar({ icon, label, count, total, color }: {
  icon: React.ReactNode; label: string; count: number; total: number; color: string;
}) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 w-20">
        <span className="text-gray-500">{icon}</span>
        <span className="text-xs text-gray-600">{label}</span>
      </div>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-10 text-right">{count}</span>
    </div>
  );
}
