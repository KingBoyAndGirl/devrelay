import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ===== User =====
export const users = sqliteTable('users', {
  id:           text('id').primaryKey(),
  username:     text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName:  text('display_name'),
  isAdmin:      integer('is_admin', { mode: 'boolean' }).default(false),
  createdAt:    text('created_at').notNull(),
  updatedAt:    text('updated_at').notNull(),
});

// ===== Workspace =====
export const workspaces = sqliteTable('workspaces', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  slug:        text('slug').notNull().unique(),
  description: text('description'),
  createdBy:   text('created_by').notNull().references(() => users.id),
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
});

// ===== Workspace Member =====
export const workspaceMembers = sqliteTable('workspace_members', {
  id:          text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  userId:      text('user_id').notNull().references(() => users.id),
  role:        text('role').notNull(),          // admin / pm / architect / developer / qa / delivery_manager
  joinedAt:    text('joined_at').notNull(),
}, (table) => ({
  uniq: uniqueIndex('wm_uniq').on(table.workspaceId, table.userId),
}));

// ===== Invitation =====
export const invitations = sqliteTable('invitations', {
  id:          text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  code:        text('code').notNull().unique(),
  createdBy:   text('created_by').notNull(),
  role:        text('role').notNull().default('developer'),
  usedBy:      text('used_by'),
  expiresAt:   text('expires_at'),
  createdAt:   text('created_at').notNull(),
});

// ===== Repository =====
export const repositories = sqliteTable('repositories', {
  id:             text('id').primaryKey(),
  workspaceId:    text('workspace_id').notNull().references(() => workspaces.id),
  name:           text('name').notNull(),
  provider:       text('provider').notNull().default('github'),
  remoteUrl:      text('remote_url').notNull(),
  accessToken:    text('access_token'),
  tokenExpiresAt: text('token_expires_at'),
  refreshToken:   text('refresh_token'),
  defaultBranch:  text('default_branch').default('main'),
  webhookSecret:  text('webhook_secret'),
  createdAt:      text('created_at').notNull(),
  updatedAt:      text('updated_at').notNull(),
});

// ===== Project =====
export const projects = sqliteTable('projects', {
  id:          text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  name:        text('name').notNull(),
  description: text('description'),
  customer:    text('customer'),
  status:      text('status').notNull().default('active'),  // active / completed / archived
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
});

// ===== ProjectRepo =====
export const projectRepos = sqliteTable('project_repos', {
  id:           text('id').primaryKey(),
  projectId:    text('project_id').notNull().references(() => projects.id),
  repositoryId: text('repository_id').notNull().references(() => repositories.id),
}, (table) => ({
  uniq: uniqueIndex('pr_uniq').on(table.projectId, table.repositoryId),
}));

// ===== Stage =====
export const stages = sqliteTable('stages', {
  id:           text('id').primaryKey(),
  projectId:    text('project_id').notNull().references(() => projects.id),
  step:         integer('step').notNull(),
  name:         text('name').notNull(),
  status:       text('status').notNull().default('pending'),
  requiredRole: text('required_role'),
  assignedTo:   text('assigned_to'),
  reviewNotes:  text('review_notes'),
  startedAt:    text('started_at'),
  completedAt:  text('completed_at'),
}, (table) => ({
  uniq: uniqueIndex('st_uniq').on(table.projectId, table.step),
}));

// ===== Document =====
export const documents = sqliteTable('documents', {
  id:        text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  type:      text('type').notNull(),
  title:     text('title').notNull(),
  filePath:  text('file_path').notNull(),
  version:   integer('version').default(1),
  createdBy: text('created_by'),
  stageId:   text('stage_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ===== Task =====
export const tasks = sqliteTable('tasks', {
  id:            text('id').primaryKey(),
  projectId:     text('project_id').notNull().references(() => projects.id),
  title:         text('title').notNull(),
  description:   text('description'),
  status:        text('status').notNull().default('todo'),
  priority:      text('priority').default('medium'),
  assignedTo:    text('assigned_to'),
  stageId:       text('stage_id'),
  agentId:       text('agent_id'),
  repositoryId:  text('repository_id'),
  gitBranch:     text('git_branch'),
  gitCommitSha:  text('git_commit_sha'),
  githubIssueId: text('github_issue_id'),
  createdAt:     text('created_at').notNull(),
  updatedAt:     text('updated_at').notNull(),
});

// ===== Agent =====
export const agents = sqliteTable('agents', {
  id:           text('id').primaryKey(),
  workspaceId:  text('workspace_id').notNull().references(() => workspaces.id),
  createdBy:    text('created_by').notNull().references(() => users.id),
  type:         text('type').notNull(),
  name:         text('name').notNull(),
  role:         text('role').notNull().default('developer'),
  execPath:     text('exec_path'),
  argsTemplate: text('args_template'),
  envVars:      text('env_vars'),
  enabled:      integer('enabled', { mode: 'boolean' }).default(true),
  gitName:      text('git_name'),
  gitEmail:     text('git_email'),
  config:       text('config'),
  createdAt:    text('created_at').notNull(),
});

export const agentProjects = sqliteTable('agent_projects', {
  id:        text('id').primaryKey(),
  agentId:   text('agent_id').notNull().references(() => agents.id),
  projectId: text('project_id').notNull().references(() => projects.id),
}, (table) => ({
  uniq: uniqueIndex('ap_uniq').on(table.agentId, table.projectId),
}));

// ===== ProjectMember =====
export const projectMembers = sqliteTable('project_members', {
  id:        text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  userId:    text('user_id').notNull().references(() => users.id),
  role:      text('role').notNull(),
  joinedAt:  text('joined_at').notNull(),
}, (table) => ({
  uniq: uniqueIndex('pm_uniq').on(table.projectId, table.userId),
}));

// ===== GitHub Tables =====
export const githubIssues = sqliteTable('github_issues', {
  id:            text('id').primaryKey(),
  repositoryId:  text('repository_id').notNull().references(() => repositories.id),
  issueNumber:   integer('issue_number').notNull(),
  title:         text('title').notNull(),
  body:          text('body'),
  state:         text('state').default('open'),
  labels:        text('labels'),
  assignees:     text('assignees'),
  devrelayTaskId: text('devrelay_task_id'),
  syncedAt:      text('synced_at').notNull(),
  createdAt:     text('created_at').notNull(),
  updatedAt:     text('updated_at').notNull(),
});

export const pullRequests = sqliteTable('pull_requests', {
  id:             text('id').primaryKey(),
  repositoryId:   text('repository_id').notNull().references(() => repositories.id),
  prNumber:       integer('pr_number').notNull(),
  title:          text('title').notNull(),
  body:           text('body'),
  state:          text('state').default('open'),
  sourceBranch:   text('source_branch'),
  targetBranch:   text('target_branch'),
  commitSha:      text('commit_sha'),
  devrelayTaskId:  text('devrelay_task_id'),
  devrelayStageId: text('devrelay_stage_id'),
  createdAt:      text('created_at').notNull(),
  updatedAt:      text('updated_at').notNull(),
});

export const linkedCommits = sqliteTable('linked_commits', {
  id:           text('id').primaryKey(),
  repositoryId: text('repository_id').notNull().references(() => repositories.id),
  sha:          text('sha').notNull(),
  message:      text('message'),
  author:       text('author'),
  branch:       text('branch'),
  taskId:       text('task_id'),
  projectId:    text('project_id'),
  createdAt:    text('created_at').notNull(),
});

// ===== Notification =====
export const notifications = sqliteTable('notifications', {
  id:        text('id').primaryKey(),
  userId:    text('user_id').notNull(),
  title:     text('title').notNull(),
  message:   text('message'),
  type:      text('type').notNull(),
  isRead:    integer('is_read', { mode: 'boolean' }).default(false),
  projectId: text('project_id'),
  stageId:   text('stage_id'),
  taskId:    text('task_id'),
  createdAt: text('created_at').notNull(),
});

// ===== Comments =====
export const comments = sqliteTable('comments', {
  id:        text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  userId:    text('user_id').notNull(),
  userName:  text('user_name'),
  content:   text('content').notNull(),
  stageId:   text('stage_id'),
  taskId:    text('task_id'),
  createdAt: text('created_at').notNull(),
});

// ===== Activity =====
export const activities = sqliteTable('activities', {
  id:          text('id').primaryKey(),
  workspaceId: text('workspace_id'),
  projectId:   text('project_id'),
  actorId:     text('actor_id').notNull(),
  actorName:   text('actor_name'),
  action:      text('action').notNull(),
  target:      text('target'),
  metadata:    text('metadata'),
  createdAt:   text('created_at').notNull(),
});

// ===== GitHub OAuth temporary token =====
export const githubOAuthTokens = sqliteTable('github_oauth_tokens', {
  id:             text('id').primaryKey(),
  workspaceId:    text('workspace_id').notNull(),
  accessToken:    text('access_token').notNull(),
  refreshToken:   text('refresh_token'),
  tokenExpiresAt: text('token_expires_at'),
  createdAt:      text('created_at').notNull(),
});

// ===== Deployments =====
export const deployments = sqliteTable('deployments', {
  id:          text('id').primaryKey(),
  projectId:   text('project_id').notNull().references(() => projects.id),
  stageId:     text('stage_id'),
  version:     text('version'),
  environment: text('environment').default('production'),
  status:      text('status').notNull().default('pending'), // pending / deploying / success / failed
  log:         text('log'),
  deployedAt:  text('deployed_at'),
  createdAt:   text('created_at').notNull(),
});

// ===== Feedback =====
export const feedback = sqliteTable('feedback', {
  id:          text('id').primaryKey(),
  projectId:   text('project_id').notNull().references(() => projects.id),
  stageId:     text('stage_id'),
  type:        text('type').notNull().default('feedback'), // feedback / bug / incident / improvement
  title:       text('title').notNull(),
  description: text('description'),
  severity:    text('severity').default('medium'), // low / medium / high / critical
  status:      text('status').notNull().default('open'), // open / acknowledged / resolved / closed
  reportedBy:  text('reported_by'),
  assignedTo:  text('assigned_to'),
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
});
