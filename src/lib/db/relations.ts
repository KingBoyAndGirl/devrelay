import { relations } from 'drizzle-orm';
import {
  users,
  workspaces,
  workspaceMembers,
  invitations,
  repositories,
  projects,
  projectRepos,
  stages,
  documents,
  tasks,
  agents,
  agentProjects,
  projectMembers,
  githubIssues,
  pullRequests,
  linkedCommits,
  notifications,
  activities,
} from './schema';

export const usersRelations = relations(users, ({ many }) => ({
  workspaceMembers: many(workspaceMembers),
  agents: many(agents),
  projectMembers: many(projectMembers),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  repositories: many(repositories),
  projects: many(projects),
  agents: many(agents),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [workspaceMembers.userId],
    references: [users.id],
  }),
}));

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [repositories.workspaceId],
    references: [workspaces.id],
  }),
  projectRepos: many(projectRepos),
  githubIssues: many(githubIssues),
  pullRequests: many(pullRequests),
  linkedCommits: many(linkedCommits),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id],
  }),
  projectRepos: many(projectRepos),
  stages: many(stages),
  documents: many(documents),
  tasks: many(tasks),
  agentProjects: many(agentProjects),
  projectMembers: many(projectMembers),
}));

export const projectReposRelations = relations(projectRepos, ({ one }) => ({
  project: one(projects, {
    fields: [projectRepos.projectId],
    references: [projects.id],
  }),
  repository: one(repositories, {
    fields: [projectRepos.repositoryId],
    references: [repositories.id],
  }),
}));

export const stagesRelations = relations(stages, ({ one, many }) => ({
  project: one(projects, {
    fields: [stages.projectId],
    references: [projects.id],
  }),
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  project: one(projects, {
    fields: [documents.projectId],
    references: [projects.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [agents.workspaceId],
    references: [workspaces.id],
  }),
  createdByUser: one(users, {
    fields: [agents.createdBy],
    references: [users.id],
  }),
  agentProjects: many(agentProjects),
}));

export const agentProjectsRelations = relations(agentProjects, ({ one }) => ({
  agent: one(agents, {
    fields: [agentProjects.agentId],
    references: [agents.id],
  }),
  project: one(projects, {
    fields: [agentProjects.projectId],
    references: [projects.id],
  }),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [projectMembers.userId],
    references: [users.id],
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [invitations.workspaceId],
    references: [workspaces.id],
  }),
}));

export const githubIssuesRelations = relations(githubIssues, ({ one }) => ({
  repository: one(repositories, {
    fields: [githubIssues.repositoryId],
    references: [repositories.id],
  }),
}));

export const pullRequestsRelations = relations(pullRequests, ({ one }) => ({
  repository: one(repositories, {
    fields: [pullRequests.repositoryId],
    references: [repositories.id],
  }),
}));

export const linkedCommitsRelations = relations(linkedCommits, ({ one }) => ({
  repository: one(repositories, {
    fields: [linkedCommits.repositoryId],
    references: [repositories.id],
  }),
}));
