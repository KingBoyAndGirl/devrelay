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

// Agent role (inherits from Role but specifically for agents)
export type AgentRole = Role;

// Notification type
export type NotificationType = 'stage_assigned' | 'stage_rejected' | 'stage_approved' | 'task_assigned' | 'pr_opened' | 'comment';

// Document type
export type DocumentType = 'prd' | 'prototype' | 'tech_design' | 'code_review_report' | 'test_plan' | 'test_report' | 'acceptance_report' | 'deployment_log';

// Stage pool — all available stages grouped by category
export const STAGE_POOL: Record<string, string[]> = {
  需求: ['需求澄清', '需求收集', 'PRD编写', '技术评审'],
  设计: ['原型设计', '技术方案', '方案评审'],
  开发: ['任务拆分', '开发实现', '代码评审'],
  质量: ['单元测试', '集成测试', 'QA验收', '性能测试', '安全审计'],
  交付: ['文档编写', '部署发布', '交付验收', '客户验收'],
  运维: ['线上监控', '反馈收集'],
};

// Issue stage templates
export interface IssueTemplate {
  name: string;
  description: string;
  stages: string[];
}

export const ISSUE_TEMPLATES: Record<string, IssueTemplate> = {
  'full-delivery': {
    name: '完整交付',
    description: '端到端软件交付全流程',
    stages: [
      '需求澄清', 'PRD编写', '原型设计', '技术方案', '方案评审',
      '任务拆分', '开发实现', '代码评审', '单元测试', '集成测试',
      'QA验收', '性能测试', '安全审计', '文档编写', '部署发布',
      '交付验收', '客户验收', '线上监控', '反馈收集',
    ],
  },
  'feature-dev': {
    name: '功能开发',
    description: '标准功能开发流程',
    stages: ['需求澄清', '技术方案', '开发实现', '代码评审', 'QA验收', '部署发布', '交付验收'],
  },
  'bug-fix': {
    name: 'Bug 修复',
    description: 'Bug 修复精简流程',
    stages: ['复现确认', '开发实现', '代码评审', 'QA验收', '部署发布'],
  },
  hotfix: {
    name: '紧急修复',
    description: '线上紧急修复快速通道',
    stages: ['开发实现', '代码评审', '部署发布'],
  },
  custom: {
    name: '自定义',
    description: '从阶段池中自由选择',
    stages: [],
  },
};

// Keep legacy references for backward compatibility
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

export const STAGE_DEFAULT_ROLES: Record<number, string> = {
  1: 'pm',
  2: 'pm',
  3: 'architect',
  4: 'architect',
  5: 'architect',
  6: 'pm',
  7: 'developer',
  8: 'architect',
  9: 'qa',
  10: 'pm',
  11: 'delivery_manager',
  12: 'pm',
  13: 'developer',
};

export const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  pm: '产品经理',
  architect: '架构师',
  developer: '开发工程师',
  qa: '测试工程师',
  delivery_manager: '交付经理',
};

export const ROLE_PERMISSIONS: Record<string, { stages: string; capabilities: string[] }> = {
  admin: {
    stages: '全部阶段',
    capabilities: ['管理空间', '邀请/移除成员', '管理 Agent', '管理项目', '连接仓库', '通过/驳回阶段', '触发部署'],
  },
  pm: {
    stages: '01-02, 06, 10, 12',
    capabilities: ['需求收集与 PRD 编写', '任务拆分与分配', '验收评审与交付', '邀请成员', '创建/归档项目', '同步 Issues'],
  },
  architect: {
    stages: '03-05, 08',
    capabilities: ['原型设计', '技术方案编写', '方案评审', '代码评审', '执行 Agent 任务', '创建项目'],
  },
  developer: {
    stages: '07, 13',
    capabilities: ['代码开发实现', '线上监控与反馈', '创建 PR（自动）', '执行 Agent 任务', '创建任务'],
  },
  qa: {
    stages: '09',
    capabilities: ['测试执行', '提交 Bug 反馈', '执行 Agent 任务', '创建任务'],
  },
  delivery_manager: {
    stages: '11',
    capabilities: ['部署发布', '查看部署状态', '变更审批', '通过/驳回阶段'],
  },
};
