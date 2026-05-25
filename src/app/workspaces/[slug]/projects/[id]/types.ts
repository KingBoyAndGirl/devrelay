// Shared types and constants for project detail page

export interface LinkedPR {
  id: string;
  prNumber: number;
  title: string;
  state: string;
  sourceBranch: string | null;
  targetBranch: string | null;
}

export interface Stage {
  id: string;
  step: number;
  name: string;
  status: string;
  requiredRole: string | null;
  assignedTo: string | null;
  assignedAgentName: string | null;
  reviewNotes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  linkedPRs: LinkedPR[];
}

export interface Comment {
  id: string;
  userId: string;
  userName: string | null;
  content: string;
  stageId: string | null;
  createdAt: string;
}

export interface Deployment {
  id: string;
  version: string | null;
  environment: string;
  status: string;
  deployedAt: string | null;
  createdAt: string;
}

export interface FeedbackItem {
  id: string;
  type: string;
  title: string;
  severity: string;
  status: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  customer: string | null;
  status: string;
  stages: Stage[];
  latestDeployment: Deployment | null;
  recentFeedback: FeedbackItem[];
}

export interface WorkspaceAgent {
  id: string;
  name: string;
  role: string;
  type: string;
  assigned: boolean;
}

export const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 border-gray-300',
  in_progress: 'bg-blue-50 border-blue-400',
  completed: 'bg-green-50 border-green-400',
  rejected: 'bg-red-50 border-red-400',
};

export const STATUS_DOT: Record<string, string> = {
  pending: 'bg-gray-400',
  in_progress: 'bg-blue-500 animate-pulse',
  completed: 'bg-green-500',
  rejected: 'bg-red-500',
};

export const STATUS_LABEL: Record<string, string> = {
  pending: '待开始',
  in_progress: '进行中',
  completed: '已完成',
  rejected: '已驳回',
};
