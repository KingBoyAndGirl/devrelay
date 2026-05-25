import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { repositories, pullRequests, linkedCommits, projectRepos, issues, stages, githubIssues, tasks } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { createNotification } from '@/lib/notify';
import { approveIssueStage } from '@/lib/workflow';

// Verify webhook signature (simplified — full HMAC check in production)
function verifySignature(_req: NextRequest, _secret: string): boolean {
  // In production: compare X-Hub-Signature-256 header with HMAC-SHA256 of body
  return true;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { repoId: string } }
) {
  const repo = await db.query.repositories.findFirst({
    where: eq(repositories.id, params.repoId),
    with: { workspace: { with: { members: true } } },
  });

  if (!repo) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (repo.webhookSecret && !verifySignature(req, repo.webhookSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = req.headers.get('x-github-event');
  const body = await req.json();
  const now = new Date().toISOString();

  try {
    switch (event) {
      case 'push': {
        const commits = body.commits || [];
        for (const commit of commits) {
          await db.insert(linkedCommits).values({
            id: createId(),
            repositoryId: repo.id,
            sha: commit.id,
            message: commit.message,
            author: commit.author?.name || body.pusher?.name || 'unknown',
            branch: body.ref?.replace('refs/heads/', ''),
            createdAt: now,
          });
        }
        break;
      }

      case 'pull_request': {
        const pr = body.pull_request;
        if (!pr) break;

        const existing = await db.query.pullRequests.findFirst({
          where: and(
            eq(pullRequests.repositoryId, repo.id),
            eq(pullRequests.prNumber, pr.number),
          ),
        });

        let prId = existing?.id;
        if (existing) {
          await db.update(pullRequests).set({
            title: pr.title,
            body: pr.body || null,
            state: pr.state,
            sourceBranch: pr.head?.ref,
            targetBranch: pr.base?.ref,
            commitSha: pr.head?.sha,
            updatedAt: pr.updated_at || now,
          }).where(eq(pullRequests.id, existing.id));
        } else {
          prId = createId();
          await db.insert(pullRequests).values({
            id: prId,
            repositoryId: repo.id,
            prNumber: pr.number,
            title: pr.title,
            body: pr.body || null,
            state: pr.state,
            sourceBranch: pr.head?.ref,
            targetBranch: pr.base?.ref,
            commitSha: pr.head?.sha,
            createdAt: pr.created_at || now,
            updatedAt: pr.updated_at || now,
          });
        }

        // Link PR to code review stage (step 8) for all projects using this repo
        const linkedProjects = await db.query.projectRepos.findMany({
          where: eq(projectRepos.repositoryId, repo.id),
        });

        for (const link of linkedProjects) {
          // Find code review stage by name across all project issues
          const projIssues = await db.query.issues.findMany({ where: eq(issues.projectId, link.projectId), columns: { id: true } });
          const projIssueIds = projIssues.map(i => i.id);
          const reviewStage = projIssueIds.length > 0 ? await db.query.stages.findFirst({
            where: and(inArray(stages.issueId, projIssueIds), eq(stages.name, '代码评审')),
          }) : null;

          if (!reviewStage) continue;

          // Link PR to the stage if not already linked
          if (!existing?.devrelayStageId) {
            await db.update(pullRequests)
              .set({ devrelayStageId: reviewStage.id })
              .where(eq(pullRequests.id, prId!));
          }

          const action = body.action;
          const isMerged = pr.merged === true;

          if (action === 'opened' || action === 'reopened') {
            // Set code review stage to in_progress when PR is opened
            if (reviewStage.status === 'pending') {
              await db.update(stages)
                .set({ status: 'in_progress', startedAt: now })
                .where(eq(stages.id, reviewStage.id));
            }
          } else if (action === 'closed' && isMerged) {
            // Auto-approve code review stage when PR is merged
            if (reviewStage.status === 'in_progress') {
              await approveIssueStage(reviewStage.issueId, reviewStage.step);
            }
          }
        }

        // Notify workspace members
        if (repo.workspace?.members) {
          for (const member of repo.workspace.members) {
            await createNotification({
              userId: member.userId,
              title: `PR ${body.action}: ${pr.title}`,
              message: `${repo.name} PR #${pr.number} ${body.action}${pr.merged ? ' (merged)' : ''}`,
              type: 'pr_opened',
            });
          }
        }
        break;
      }

      case 'issues': {
        const issue = body.issue;
        if (!issue) break;

        const action = body.action;

        // Upsert in githubIssues sync table
        const existingIssue = await db.query.githubIssues.findFirst({
          where: and(
            eq(githubIssues.repositoryId, repo.id),
            eq(githubIssues.issueNumber, issue.number),
          ),
        });

        let syncedIssueId = existingIssue?.id;

        if (existingIssue) {
          await db.update(githubIssues).set({
            title: issue.title,
            body: issue.body || null,
            state: issue.state,
            labels: JSON.stringify(issue.labels?.map((l: any) => l.name) || []),
            updatedAt: issue.updated_at || now,
          }).where(eq(githubIssues.id, existingIssue.id));
        } else {
          syncedIssueId = createId();
          await db.insert(githubIssues).values({
            id: syncedIssueId,
            repositoryId: repo.id,
            issueNumber: issue.number,
            title: issue.title,
            body: issue.body || null,
            state: issue.state,
            labels: JSON.stringify(issue.labels?.map((l: any) => l.name) || []),
            syncedAt: now,
            createdAt: issue.created_at || now,
            updatedAt: issue.updated_at || now,
          });
        }

        // Create devrelay task for new issues on linked projects
        if (action === 'opened' && !existingIssue) {
          const linkedProjects = await db.query.projectRepos.findMany({
            where: eq(projectRepos.repositoryId, repo.id),
          });

          for (const link of linkedProjects) {
            // Find development stage by name across all project issues
            const projIssues = await db.query.issues.findMany({ where: eq(issues.projectId, link.projectId), columns: { id: true } });
            const projIssueIds = projIssues.map(i => i.id);
            const devStage = projIssueIds.length > 0 ? await db.query.stages.findFirst({
              where: and(inArray(stages.issueId, projIssueIds), eq(stages.name, '开发实现')),
            }) : null;

            const taskId = createId();
            await db.insert(tasks).values({
              id: taskId,
              projectId: link.projectId,
              title: `[GitHub] ${issue.title}`,
              description: issue.body || null,
              status: 'todo',
              priority: issue.labels?.some((l: any) => l.name === 'bug') ? 'high' : 'medium',
              stageId: devStage?.id || null,
              agentId: devStage?.assignedTo || null,
              githubIssueId: String(issue.number),
              createdAt: now,
              updatedAt: now,
            });

            // Link the task back in the sync table
            if (syncedIssueId) {
              await db.update(githubIssues)
                .set({ devrelayTaskId: taskId })
                .where(eq(githubIssues.id, syncedIssueId));
            }
          }
        }

        // If the issue is closed, update linked tasks to done
        if (action === 'closed' && existingIssue?.devrelayTaskId) {
          await db.update(tasks)
            .set({ status: 'done', updatedAt: now })
            .where(eq(tasks.id, existingIssue.devrelayTaskId));
        }

        // Notify workspace members
        if (repo.workspace?.members) {
          for (const member of repo.workspace.members) {
            await createNotification({
              userId: member.userId,
              title: `Issue ${action}: ${issue.title}`,
              message: `${repo.name} Issue #${issue.number} ${action}`,
              type: 'comment',
            });
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[webhook] Error processing ${event}:`, err);
  }

  return NextResponse.json({ received: true });
}
