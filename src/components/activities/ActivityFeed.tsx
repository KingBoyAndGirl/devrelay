'use client';

import { useState, useEffect } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  GitPullRequest,
  GitMerge,
  Rocket,
  ListTodo,
  MessageSquare,
} from 'lucide-react';
import { ListSkeleton } from '@/components/ui/SkeletonLoader';

interface ActivityItem {
  id: string;
  actorId: string;
  actorName: string | null;
  action: string;
  target: string | null;
  metadata: string | null;
  createdAt: string;
}

const ACTION_META: Record<string, { label: string; badge: string; icon: typeof Play }> = {
  agent_execution_started:   { label: 'Agent 开始执行', badge: 'badge-primary', icon: Play },
  agent_execution_completed: { label: 'Agent 执行完成', badge: 'badge-success', icon: CheckCircle2 },
  stage_approved:            { label: '阶段通过',       badge: 'badge-success', icon: CheckCircle2 },
  stage_rejected:            { label: '阶段驳回',       badge: 'badge-error',   icon: XCircle },
  pr_created:                { label: 'PR 已创建',      badge: 'badge-purple',  icon: GitPullRequest },
  pr_merged:                 { label: 'PR 已合并',      badge: 'badge-purple',  icon: GitMerge },
  deployment_started:        { label: '部署开始',       badge: 'badge-warning', icon: Rocket },
  deployment_completed:      { label: '部署完成',       badge: 'badge-success', icon: Rocket },
  deployment_failed:         { label: '部署失败',       badge: 'badge-error',   icon: XCircle },
  task_created:              { label: '任务已创建',     badge: 'badge-gray',    icon: ListTodo },
  task_completed:            { label: '任务已完成',     badge: 'badge-success', icon: CheckCircle2 },
  feedback_received:         { label: '收到反馈',       badge: 'badge-orange',  icon: MessageSquare },
};

interface ActivityFeedProps {
  projectId: string;
  limit?: number;
}

export default function ActivityFeed({ projectId, limit = 50 }: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/activities?limit=${limit}`)
      .then(r => r.json())
      .then(data => {
        setActivities(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId, limit]);

  if (loading) {
    return <ListSkeleton count={3} />;
  }

  if (activities.length === 0) {
    return <div className="text-sm text-gray-400 py-4 text-center">暂无活动记录</div>;
  }

  return (
    <div className="space-y-2">
      {activities.map((act) => (
        <div key={act.id} className="flex items-center gap-3 text-sm">
          <span className="text-xs text-gray-400 w-36 shrink-0">
            {new Date(act.createdAt).toLocaleString('zh-CN')}
          </span>
          {(() => {
            const meta = ACTION_META[act.action];
            const Icon = meta?.icon || Play;
            return (
              <span className={meta?.badge || 'badge-gray'}>
                <Icon size={12} />
                {meta?.label || act.action}
              </span>
            );
          })()}
          {act.actorName && (
            <span className="text-xs text-gray-500">{act.actorName}</span>
          )}
          {act.target && (
            <code className="text-xs text-gray-400 truncate">{act.target.slice(0, 8)}</code>
          )}
        </div>
      ))}
    </div>
  );
}
