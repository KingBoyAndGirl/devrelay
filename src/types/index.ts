// Stage status
export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'rejected';

// Task status
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done';

// Project status
export type ProjectStatus = 'active' | 'completed' | 'archived';

// Priority
export type Priority = 'low' | 'medium' | 'high' | 'critical';

// Role
export type Role = 'admin' | 'pm' | 'architect' | 'developer' | 'qa' | 'delivery_manager';

// Agent type
export type AgentType = 'claude_code' | 'codex' | 'hermes' | 'openclaw' | 'custom';

// Notification type
export type NotificationType = 'stage_assigned' | 'stage_rejected' | 'stage_approved' | 'task_assigned' | 'pr_opened' | 'comment';

// Document type
export type DocumentType = 'prd' | 'prototype' | 'tech_design' | 'code_review_report' | 'test_plan' | 'test_report' | 'acceptance_report' | 'deployment_log';

// 13 steps
export const STAGE_NAMES: Record<number, string> = {
  1: '需求收集',
  2: 'PRD编写',
  3: '原型设计',
  4: '技术方案',
  5: '方案评审',
  6: '任务拆分',
  7: '开发实现',
  8: '代码评审',
  9: '测试',
  10: '验收评审',
  11: '部署发布',
  12: '交付验收',
  13: '线上监控与反馈',
};
