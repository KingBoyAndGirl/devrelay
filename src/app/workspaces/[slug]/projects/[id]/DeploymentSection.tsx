'use client';

import type { Deployment } from './types';

interface DeploymentSectionProps {
  stageStatus: string;
  latestDeployment: Deployment | null;
  deployVersion: string;
  deploying: boolean;
  onDeployVersionChange: (v: string) => void;
  onDeploy: () => void;
}

export function DeploymentSection({
  stageStatus,
  latestDeployment,
  deployVersion,
  deploying,
  onDeployVersionChange,
  onDeploy,
}: DeploymentSectionProps) {
  return (
    <div className="mt-2 border-t border-gray-200 pt-2">
      {latestDeployment && (
        <div className="text-xs mb-2">
          <span className="text-gray-500">最近部署: </span>
          <span className="font-mono">{latestDeployment.version}</span>
          <span className={
            latestDeployment.status === 'success' ? 'badge-success' :
            latestDeployment.status === 'failed' ? 'badge-error' :
            latestDeployment.status === 'deploying' ? 'badge-primary' :
            'badge-gray'
          }>{latestDeployment.status}</span>
          {latestDeployment.deployedAt && (
            <span className="text-gray-400 ml-1">{new Date(latestDeployment.deployedAt).toLocaleString('zh-CN')}</span>
          )}
        </div>
      )}
      {stageStatus === 'in_progress' && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={deployVersion}
            onChange={(e) => onDeployVersionChange(e.target.value)}
            placeholder="版本号 (如 v1.0.0)"
            className="input text-xs py-1"
          />
          <button
            onClick={onDeploy}
            disabled={deploying || !deployVersion.trim()}
            className="btn btn-primary btn-sm"
          >
            {deploying ? '部署中...' : '部署'}
          </button>
        </div>
      )}
    </div>
  );
}
