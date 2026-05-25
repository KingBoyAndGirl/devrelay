'use client';

import { useRouter } from 'next/navigation';
import { Bug, Lightbulb, Rocket, ChevronRight } from 'lucide-react';

interface IssueStage {
  id: string;
  step: number;
  name: string;
  status: string;
}

interface Issue {
  id: string;
  projectId: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignedAgentId: string | null;
  assignedAgentName?: string | null;
  stages: IssueStage[];
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  feature: <Rocket className="w-3.5 h-3.5" />,
  bug: <Bug className="w-3.5 h-3.5" />,
  improvement: <Lightbulb className="w-3.5 h-3.5" />,
};

const TYPE_COLORS: Record<string, string> = {
  feature: 'text-blue-600 bg-blue-50',
  bug: 'text-red-600 bg-red-50',
  improvement: 'text-purple-600 bg-purple-50',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'badge-gray',
  medium: 'badge-primary',
  high: 'badge-orange',
  critical: 'badge-error',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '紧急',
};

export function IssueCard({
  issue,
  slug,
  projectId,
  onDragStart,
}: {
  issue: Issue;
  slug: string;
  projectId: string;
  onDragStart?: (e: React.DragEvent, issueId: string) => void;
}) {
  const router = useRouter();
  const stages = issue.stages || [];
  const completed = stages.filter((s) => s.status === 'completed').length;
  const progress = stages.length ? Math.round((completed / stages.length) * 100) : 0;
  const currentStage = stages.find((s) => s.status === 'in_progress') || stages.find((s) => s.status === 'pending') || stages[0];

  function handleClick() {
    router.push(`/workspaces/${slug}/projects/${projectId}/issues/${issue.id}`);
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart?.(e, issue.id)}
      onClick={handleClick}
      className="card p-3 cursor-pointer hover:shadow-md transition-shadow border border-gray-100 bg-white rounded-lg select-none"
    >
      {/* Header: type + priority */}
      <div className="flex items-center justify-between mb-2">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[issue.type] || 'text-gray-600 bg-gray-100'}`}>
          {TYPE_ICONS[issue.type] || null}
          <span className="text-[10px] uppercase">{issue.type === 'feature' ? '功能' : issue.type === 'bug' ? 'Bug' : '改进'}</span>
        </span>
        {issue.priority && (
          <span className={`badge text-[10px] ${PRIORITY_COLORS[issue.priority] || 'badge-gray'}`}>
            {PRIORITY_LABELS[issue.priority] || issue.priority}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-gray-900 mb-2 line-clamp-2">{issue.title}</h4>

      {/* Current stage + mini progress */}
      {stages.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
              {currentStage?.name || '无阶段'}
            </span>
            <span>{completed}/{stages.length}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1">
            <div
              className="h-1 rounded-full bg-blue-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Assigned agent */}
      {issue.assignedAgentName && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-gray-400">
          <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-medium text-gray-500">
            {issue.assignedAgentName[0]}
          </span>
          <span>{issue.assignedAgentName}</span>
        </div>
      )}

      {/* No stages hint */}
      {stages.length === 0 && (
        <p className="text-[11px] text-gray-400 mt-1">暂无阶段</p>
      )}
    </div>
  );
}
