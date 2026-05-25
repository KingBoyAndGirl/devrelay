'use client';

import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import type { Comment } from './types';

interface CommentsSectionProps {
  stageId: string;
  expanded: boolean;
  comments: Comment[];
  commentText: string;
  submitting: boolean;
  projectId: string;
  onToggle: (stageId: string) => void;
  onCommentTextChange: (stageId: string, text: string) => void;
  onPostComment: (stageId: string) => void;
}

export function CommentsSection({
  stageId,
  expanded,
  comments,
  commentText,
  submitting,
  onToggle,
  onCommentTextChange,
  onPostComment,
}: CommentsSectionProps) {
  return (
    <>
      <button
        onClick={() => onToggle(stageId)}
        className="text-xs text-gray-400 hover:text-gray-600 mt-2 flex items-center gap-1"
      >
        <MessageSquare size={12} />
        <span>讨论</span>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {comments.map(c => (
            <div key={c.id} className="bg-white rounded px-3 py-2 border border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium">{c.userName || c.userId}</span>
                <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
          {comments.length === 0 && (
            <p className="text-xs text-gray-400">暂无评论</p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              data-comment-input={stageId}
              value={commentText}
              onChange={(e) => onCommentTextChange(stageId, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onPostComment(stageId); }}
              placeholder="添加评论..."
              className="input text-sm py-1 flex-1"
            />
            <button
              onClick={() => onPostComment(stageId)}
              disabled={submitting}
              className="btn btn-primary btn-sm"
            >
              {submitting ? '...' : '发送'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
