import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { workspaces, agents, stages, issues, tasks, projects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

function mapTypeToCLI(type: string): string {
  const map: Record<string, string> = {
    claude_code: 'claude',
    codex: 'codex',
    hermes: 'hermes',
    openclaw: 'openclaw',
    custom: 'claude',
  };
  return map[type] || 'claude';
}

interface PendingTask {
  stageId: string;
  issueId: string;
  issueTitle: string;
  agentId: string;
  agentType: string;
  cli: string;
  prompt: string;
  projectId: string;
  taskId: string | null;
  envVars: Record<string, string>;
  execPath: string | null;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  if (!token) {
    return NextResponse.json({ error: 'Empty token' }, { status: 401 });
  }

  const agentVersion = req.headers.get('x-agent-version') || null;

  const allWorkspaces = await db.query.workspaces.findMany();
  for (const ws of allWorkspaces) {
    try {
      const settings = ws.settings ? JSON.parse(ws.settings) : {};
      const tokens: any[] = settings.agentTokens || [];

      const match = tokens.find((t: any) => t.token === token);
      const legacyMatch = !match && settings.agentToken === token;

      if (match || legacyMatch) {
        if (match) {
          match.lastSeenAt = new Date().toISOString();
          if (agentVersion) match.agentVersion = agentVersion;
          await db.update(workspaces)
            .set({ settings: JSON.stringify(settings), updatedAt: new Date().toISOString() })
            .where(eq(workspaces.id, ws.id));

          try {
            const io = (globalThis as any).io;
            if (io) {
              io.emit('agent:status', {
                workspaceSlug: ws.slug,
                tokenId: match.id,
                online: true,
                lastSeenAt: match.lastSeenAt,
              });
            }
          } catch {}
        }

        // Find pending tasks for agents in this workspace
        const pendingTasks: PendingTask[] = [];
        try {
          const workspaceAgents = await db.query.agents.findMany({
            where: and(eq(agents.workspaceId, ws.id), eq(agents.enabled, true)),
          });

          for (const agent of workspaceAgents) {
            // Find in_progress stages assigned to this agent that haven't been picked up
            const pendingStages = await db.query.stages.findMany({
              where: and(
                eq(stages.assignedTo, agent.id),
                eq(stages.status, 'in_progress')
              ),
            });

            for (const stage of pendingStages) {
              const issue = await db.query.issues.findFirst({
                where: eq(issues.id, stage.issueId),
              });

              if (issue) {
                // Find the task linked to this stage
                const task = await db.query.tasks.findFirst({
                  where: and(
                    eq(tasks.stageId, stage.id),
                    eq(tasks.agentId, agent.id)
                  ),
                });

                let envVars: Record<string, string> = {};
                if (agent.envVars) {
                  try { envVars = JSON.parse(agent.envVars); } catch {}
                }

                // Merge agent.config into env vars
                if ((agent as any).config) {
                  try {
                    const cfg = JSON.parse((agent as any).config);
                    if (cfg.base_url) envVars['PROVIDER_BASE_URL'] = cfg.base_url;
                    if (cfg.env_key) envVars['PROVIDER_ENV_KEY'] = cfg.env_key;
                  } catch {}
                }

                const promptParts = [
                  `## Task: ${issue.title}`,
                  '',
                  issue.description || '',
                  '',
                  `## Stage: ${stage.name} (Step ${stage.step})`,
                  `Role: ${stage.requiredRole || agent.role}`,
                ];

                if (task) {
                  if (task.title) promptParts.push('', `## Sub-task: ${task.title}`);
                  if (task.description) promptParts.push(task.description);
                }

                pendingTasks.push({
                  stageId: stage.id,
                  issueId: issue.id,
                  issueTitle: issue.title,
                  agentId: agent.id,
                  agentType: agent.type,
                  // Use type mapping — execPath is only for custom CLI overrides
                  cli: agent.type === 'custom' ? (agent.execPath || 'claude') : mapTypeToCLI(agent.type),
                  prompt: promptParts.join('\n'),
                  projectId: issue.projectId,
                  taskId: task?.id || null,
                  envVars,
                  execPath: agent.execPath || null,
                });
              }
            }
          }
        } catch {
          // Task lookup is best-effort
        }

        return NextResponse.json({
          valid: true,
          workspace: {
            id: ws.id,
            name: ws.name,
            slug: ws.slug,
          },
          tasks: pendingTasks,
          timestamp: new Date().toISOString(),
        });
      }
    } catch {
      // skip malformed settings
    }
  }

  return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
}
