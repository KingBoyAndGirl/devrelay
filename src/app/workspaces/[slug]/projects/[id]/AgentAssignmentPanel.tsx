'use client';

import { EmptyState } from '@/components/ui/EmptyState';
import { ROLE_LABELS } from '@/types';
import type { WorkspaceAgent } from './types';

interface AgentAssignmentPanelProps {
  show: boolean;
  agents: WorkspaceAgent[];
  saving: boolean;
  onToggle: () => void;
  onAgentToggle: (agentId: string) => void;
  onSave: () => void;
}

export function AgentAssignmentPanel({
  show,
  agents,
  saving,
  onToggle,
  onAgentToggle,
  onSave,
}: AgentAssignmentPanelProps) {
  return (
    <div className="mt-8 card p-5">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="font-semibold">Agent 分配</h3>
        <span className="text-xs text-gray-400">{show ? '收起' : '展开'}</span>
      </button>

      {show && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          {agents.length === 0 ? (
            <EmptyState
              title="暂无 Agent"
              description="在空间设置中注册 AI 智能体后可在此分配"
            />
          ) : (
            <div className="space-y-2">
              {agents.map(agent => (
                <label
                  key={agent.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={agent.assigned}
                    onChange={() => onAgentToggle(agent.id)}
                    className="rounded"
                  />
                  <span className="font-medium text-sm flex-1">{agent.name}</span>
                  <span className="text-xs text-gray-400">{agent.type}</span>
                  <span className="badge-primary">
                    {ROLE_LABELS[agent.role] || agent.role}
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button
              onClick={onSave}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
