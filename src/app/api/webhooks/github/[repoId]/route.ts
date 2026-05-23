import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { repositories, pullRequests, linkedCommits } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { createNotification } from '@/lib/notify';

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
          where: eq(pullRequests.repositoryId, repo.id),
        });

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
          await db.insert(pullRequests).values({
            id: createId(),
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

        // Notify workspace members
        if (repo.workspace?.members) {
          for (const member of repo.workspace.members) {
            await createNotification({
              userId: member.userId,
              title: `PR ${pr.state}: ${pr.title}`,
              message: `${repo.name} PR #${pr.number} ${pr.state}`,
              type: 'pr_opened',
            });
          }
        }
        break;
      }

      case 'issues': {
        const issue = body.issue;
        if (issue) {
          for (const member of repo.workspace?.members || []) {
            await createNotification({
              userId: member.userId,
              title: `Issue ${body.action}: ${issue.title}`,
              message: `${repo.name} Issue #${issue.number}`,
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
