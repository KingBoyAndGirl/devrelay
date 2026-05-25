'use client';

import { ROLE_LABELS } from '@/types';
import { STATUS_COLORS, STATUS_DOT, STATUS_LABEL } from './types';
import { CommentsSection } from './CommentsSection';
import { DeploymentSection } from './DeploymentSection';
import { FeedbackSection } from './FeedbackSection';
import type { Stage, Comment, Deployment, FeedbackItem } from './types';

interface StageCardProps {
  stage: Stage;
  projectId: string;
  isHidden: boolean;
  acting: number | null;
  assigning: number | null;
  showReject: number | null;
  editingRole: number | null;
  rejectNotes: string;
  expandedComments: Set<string>;
  comments: Record<string, Comment[]>;
  commentText: Record<string, string>;
  submittingComment: Record<string, boolean>;
  latestDeployment: Deployment | null;
  recentFeedback: FeedbackItem[];
  deployVersion: string;
  deploying: boolean;
  feedbackType: string;
  feedbackTitle: string;
  feedbackSeverity: string;
  submittingFeedback: boolean;
  onApprove: (step: number) => void;
  onReject: (step: number) => void;
  onAutoAssign: (step: number) => void;
  onRoleChange: (step: number, role: string) => void;
  onSetEditingRole: (step: number | null) => void;
  onSetShowReject: (step: number | null) => void;
  onRejectNotesChange: (notes: string) => void;
  onToggleComments: (stageId: string) => void;
  onCommentTextChange: (stageId: string, text: string) => void;
  onPostComment: (stageId: string) => void;
  onDeployVersionChange: (v: string) => void;
  onDeploy: () => void;
  onFeedbackTypeChange: (v: string) => void;
  onFeedbackTitleChange: (v: string) => void;
  onFeedbackSeverityChange: (v: string) => void;
  onFeedbackSubmit: () => void;
}

export function StageCard({
  stage,
  projectId,
  isHidden,
  acting,
  assigning,
  showReject,
  editingRole,
  rejectNotes,
  expandedComments,
  comments,
  commentText,
  submittingComment,
  latestDeployment,
  recentFeedback,
  deployVersion,
  deploying,
  feedbackType,
  feedbackTitle,
  feedbackSeverity,
  submittingFeedback,
  onApprove,
  onReject,
  onAutoAssign,
  onRoleChange,
  onSetEditingRole,
  onSetShowReject,
  onRejectNotesChange,
  onToggleComments,
  onCommentTextChange,
  onPostComment,
  onDeployVersionChange,
  onDeploy,
  onFeedbackTypeChange,
  onFeedbackTitleChange,
  onFeedbackSeverityChange,
  onFeedbackSubmit,
}: StageCardProps) {
  return (
    <div
      id={`stage-${stage.step}`}
      className={`border rounded-xl transition-all duration-300 ease-out ${STATUS_COLORS[stage.status]} ${
        isHidden ? 'max-h-0 opacity-0 overflow-hidden p-0 border-0' : 'max-h-[2000px] opacity-100'
      }`}
    >
      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
        <div className="flex items-center gap-2 w-12">
          <span className={`w-3 h-3 rounded-full ${STATUS_DOT[stage.status]}`} />
          <span className="text-sm font-bold text-gray-400">{String(stage.step).padStart(2, '0')}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold">{stage.name}</h3>
            <span className={
              stage.status === 'completed' ? 'badge-success' :
              stage.status === 'in_progress' ? 'badge-primary' :
              stage.status === 'rejected' ? 'badge-error' :
              'badge-gray'
            }>
              {STATUS_LABEL[stage.status]}
            </span>

            {/* Role selector */}
            {(stage.status === 'pending' || stage.status === 'in_progress') ? (
              <div className="relative" data-role-dropdown>
                <button
                  onClick={() => onSetEditingRole(editingRole === stage.step ? null : stage.step)}
                  className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer"
                >
                  {stage.requiredRole ? (ROLE_LABELS[stage.requiredRole] || stage.requiredRole) : '未设置'} ▾
                </button>
                {editingRole === stage.step && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[120px]">
                    {['developer', 'qa', 'delivery_manager', 'pm', 'architect'].map(role => (
                      <button
                        key={role}
                        onClick={() => onRoleChange(stage.step, role)}
                        className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${
                          stage.requiredRole === role ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                        }`}
                      >
                        {ROLE_LABELS[role] || role}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              stage.requiredRole && (
                <span className="text-xs text-gray-400">
                  {ROLE_LABELS[stage.requiredRole] || stage.requiredRole}
                </span>
              )
            )}

            {stage.assignedAgentName && (
              <span className="badge-success font-mono">{stage.assignedAgentName}</span>
            )}
            {(stage.status === 'pending' || stage.status === 'in_progress') && !stage.assignedTo && (
              <button
                onClick={() => onAutoAssign(stage.step)}
                disabled={assigning === stage.step}
                className="badge-primary hover:opacity-80 disabled:opacity-50 cursor-pointer"
              >
                {assigning === stage.step ? '分配中...' : '自动分配'}
              </button>
            )}
          </div>

          {/* Timestamps */}
          {stage.startedAt && (
            <p className="text-xs text-gray-400 mt-1">
              开始: {new Date(stage.startedAt).toLocaleString('zh-CN')}
              {stage.completedAt && ` · 完成: ${new Date(stage.completedAt).toLocaleString('zh-CN')}`}
            </p>
          )}
          {stage.reviewNotes && (
            <p className="text-sm text-red-600 mt-2 bg-red-50 rounded p-2">{stage.reviewNotes}</p>
          )}

          {/* Linked PRs */}
          {stage.linkedPRs.length > 0 && (
            <div className="mt-2 space-y-1">
              {stage.linkedPRs.map(pr => (
                <div key={pr.id} className="text-xs flex items-center gap-2 bg-white rounded px-2 py-1 border border-gray-200">
                  <span className="font-mono text-gray-500">#{pr.prNumber}</span>
                  <span className="truncate">{pr.title}</span>
                  <span className={
                    pr.state === 'open' ? 'badge-success' :
                    pr.state === 'merged' ? 'badge-purple' :
                    'badge-error'
                  }>
                    {pr.state === 'open' ? 'open' : pr.state === 'merged' ? 'merged' : pr.state}
                  </span>
                  {pr.sourceBranch && (
                    <span className="font-mono text-gray-400">{pr.sourceBranch}→{pr.targetBranch}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Step 11: Deployment */}
          {stage.step === 11 && (
            <DeploymentSection
              stageStatus={stage.status}
              latestDeployment={latestDeployment}
              deployVersion={deployVersion}
              deploying={deploying}
              onDeployVersionChange={onDeployVersionChange}
              onDeploy={onDeploy}
            />
          )}

          {/* Step 13: Feedback */}
          {stage.step === 13 && (
            <FeedbackSection
              recentFeedback={recentFeedback}
              feedbackType={feedbackType}
              feedbackTitle={feedbackTitle}
              feedbackSeverity={feedbackSeverity}
              submitting={submittingFeedback}
              onFeedbackTypeChange={onFeedbackTypeChange}
              onFeedbackTitleChange={onFeedbackTitleChange}
              onFeedbackSeverityChange={onFeedbackSeverityChange}
              onSubmit={onFeedbackSubmit}
            />
          )}

          {/* Comments */}
          <CommentsSection
            stageId={stage.id}
            expanded={expandedComments.has(stage.id)}
            comments={comments[stage.id] || []}
            commentText={commentText[stage.id] || ''}
            submitting={submittingComment[stage.id] || false}
            projectId={projectId}
            onToggle={onToggleComments}
            onCommentTextChange={onCommentTextChange}
            onPostComment={onPostComment}
          />
        </div>

        {/* Action buttons */}
        {stage.status === 'in_progress' && (
          <div className="flex gap-2 mt-2 md:mt-0 shrink-0">
            {showReject === stage.step ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={rejectNotes}
                  onChange={(e) => onRejectNotesChange(e.target.value)}
                  placeholder="驳回原因... (Enter 确认, Esc 取消)"
                  className="input text-sm py-1 border-red-300"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onReject(stage.step);
                    else if (e.key === 'Escape') { onSetShowReject(null); onRejectNotesChange(''); }
                  }}
                  autoFocus
                />
                <button
                  onClick={() => onReject(stage.step)}
                  disabled={acting === stage.step}
                  className="btn btn-danger btn-sm"
                >
                  确认
                </button>
                <button
                  onClick={() => { onSetShowReject(null); onRejectNotesChange(''); }}
                  className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                >
                  取消
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => onApprove(stage.step)}
                  disabled={acting === stage.step}
                  className="btn btn-success btn-sm"
                >
                  {acting === stage.step ? '...' : '通过'}
                </button>
                <button
                  onClick={() => onSetShowReject(stage.step)}
                  disabled={acting === stage.step}
                  className="btn btn-danger btn-sm"
                >
                  驳回
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
