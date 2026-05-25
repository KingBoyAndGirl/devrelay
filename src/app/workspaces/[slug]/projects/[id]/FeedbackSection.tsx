'use client';

import type { FeedbackItem } from './types';

interface FeedbackSectionProps {
  recentFeedback: FeedbackItem[];
  feedbackType: string;
  feedbackTitle: string;
  feedbackSeverity: string;
  submitting: boolean;
  onFeedbackTypeChange: (v: string) => void;
  onFeedbackTitleChange: (v: string) => void;
  onFeedbackSeverityChange: (v: string) => void;
  onSubmit: () => void;
}

export function FeedbackSection({
  recentFeedback,
  feedbackType,
  feedbackTitle,
  feedbackSeverity,
  submitting,
  onFeedbackTypeChange,
  onFeedbackTitleChange,
  onFeedbackSeverityChange,
  onSubmit,
}: FeedbackSectionProps) {
  return (
    <div className="mt-2 border-t border-gray-200 pt-2">
      {recentFeedback.length > 0 && (
        <div className="space-y-1 mb-2">
          {recentFeedback.map(f => (
            <div key={f.id} className="text-xs flex items-center gap-2 bg-white rounded px-2 py-1 border border-gray-100">
              <span className={
                f.type === 'bug' ? 'badge-error' :
                f.type === 'incident' ? 'badge-orange' :
                'badge-primary'
              }>{f.type}</span>
              <span className="truncate">{f.title}</span>
              <span className={
                f.severity === 'critical' ? 'badge-error' :
                f.severity === 'high' ? 'badge-orange' :
                'badge-gray'
              }>{f.severity}</span>
              <span className={
                f.status === 'open' ? 'badge-warning' :
                f.status === 'resolved' ? 'badge-success' :
                'badge-gray'
              }>{f.status}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <select
          value={feedbackType}
          onChange={(e) => onFeedbackTypeChange(e.target.value)}
          className="select text-xs py-1"
        >
          <option value="feedback">反馈</option>
          <option value="bug">Bug</option>
          <option value="incident">事故</option>
          <option value="improvement">改进</option>
        </select>
        <select
          value={feedbackSeverity}
          onChange={(e) => onFeedbackSeverityChange(e.target.value)}
          className="select text-xs py-1"
        >
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
          <option value="critical">严重</option>
        </select>
        <input
          type="text"
          value={feedbackTitle}
          onChange={(e) => onFeedbackTitleChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
          placeholder="反馈标题..."
          className="input text-xs py-1 flex-1"
        />
        <button
          onClick={onSubmit}
          disabled={submitting || !feedbackTitle.trim()}
          className="btn btn-sm bg-orange-600 text-white hover:bg-orange-700"
        >
          提交
        </button>
      </div>
    </div>
  );
}
