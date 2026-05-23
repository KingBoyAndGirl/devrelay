'use client';

import { useState, useEffect } from 'react';

interface ActivityItem {
  id: string;
  actorId: string;
  actorName: string | null;
  action: string;
  target: string | null;
  metadata: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  agent_execution_started: 'Agent 开始执行',
  agent_execution_completed: 'Agent 执行完成',
  stage_approved: '阶段通过',
  stage_rejected: '阶段驳回',
  pr_created: 'PR 已创建',
  pr_merged: 'PR 已合并',
  deployment_started: '部署开始',
  deployment_completed: '部署完成',
  deployment_failed: '部署失败',
  task_created: '任务已创建',
  task_completed: '任务已完成',
  feedback_received: '收到反馈',
};

const ACTION_COLORS: Record<string, string> = {
  agent_execution_started: 'bg-blue-100 text-blue-700',
  agent_execution_completed: 'bg-green-100 text-green-700',
  stage_approved: 'bg-green-100 text-green-700',
  stage_rejected: 'bg-red-100 text-red-700',
  pr_created: 'bg-purple-100 text-purple-700',
  pr_merged: 'bg-purple-100 text-purple-700',
  deployment_started: 'bg-yellow-100 text-yellow-700',
  deployment_completed: 'bg-green-100 text-green-700',
  deployment_failed: 'bg-red-100 text-red-700',
  task_created: 'bg-gray-100 text-gray-600',
  task_completed: 'bg-green-100 text-green-700',
  feedback_received: 'bg-orange-100 text-orange-700',
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
    return <div className="text-sm text-gray-400 py-4 text-center">加载活动...</div>;
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
          <span className={`text-xs px-1.5 py-0.5 rounded ${ACTION_COLORS[act.action] || 'bg-gray-100 text-gray-600'}`}>
            {ACTION_LABELS[act.action] || act.action}
          </span>
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
