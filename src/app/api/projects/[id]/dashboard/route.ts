import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { issues, stages, tasks, deployments, feedback, activities, agentProjects, agents, projectRepos, pullRequests } from '@/lib/db/schema';
import { eq, desc, inArray, sql } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [stageList, taskList, deploymentList, feedbackList, activityList, agentLinkList] = await Promise.all([
    (async () => {
      const projectIssues = await db.query.issues.findMany({ where: eq(issues.projectId, params.id), columns: { id: true } });
      const issueIds = projectIssues.map(i => i.id);
      return issueIds.length > 0
        ? db.query.stages.findMany({
            where: inArray(stages.issueId, issueIds),
            orderBy: (stages, { asc }) => [asc(stages.step)],
          })
        : [];
    })(),
    db.query.tasks.findMany({
      where: eq(tasks.projectId, params.id),
    }),
    db.query.deployments.findMany({
      where: eq(deployments.projectId, params.id),
      orderBy: [desc(deployments.createdAt)],
    }),
    db.query.feedback.findMany({
      where: eq(feedback.projectId, params.id),
      orderBy: [desc(feedback.createdAt)],
    }),
    db.query.activities.findMany({
      where: eq(activities.projectId, params.id),
      orderBy: [desc(activities.createdAt)],
      limit: 50,
    }),
    db.query.agentProjects.findMany({
      where: eq(agentProjects.projectId, params.id),
    }),
  ]);

  // Get PRs through project repos
  const repoLinks = await db.query.projectRepos.findMany({
    where: eq(projectRepos.projectId, params.id),
  });
  const repoIds = repoLinks.map(r => r.repositoryId);
  const prList = repoIds.length > 0
    ? await db.query.pullRequests.findMany({
        where: inArray(pullRequests.repositoryId, repoIds),
        orderBy: [desc(pullRequests.updatedAt)],
      })
    : [];

  // Cycle time: avg time spent on completed stages
  const completedStages = stageList.filter(s => s.status === 'completed' && s.startedAt && s.completedAt);
  const cycleTimes = completedStages.map(s => {
    const start = new Date(s.startedAt!).getTime();
    const end = new Date(s.completedAt!).getTime();
    return { step: s.step, name: s.name, hours: Math.round((end - start) / 3600000 * 10) / 10 };
  });
  const avgCycleHours = cycleTimes.length
    ? Math.round(cycleTimes.reduce((sum, c) => sum + c.hours, 0) / cycleTimes.length * 10) / 10
    : 0;

  // Bottleneck detection
  const rejectedStages = stageList.filter(s => s.status === 'rejected');
  const slowStages = cycleTimes.filter(c => c.hours > avgCycleHours * 1.5 && avgCycleHours > 0);

  // Agent productivity
  const agentTasks = taskList.filter(t => t.agentId);
  const agentIds: string[] = [];
  agentTasks.forEach(t => {
    if (t.agentId && !agentIds.includes(t.agentId)) {
      agentIds.push(t.agentId);
    }
  });
  const agentInfoList = agentIds.length > 0
    ? await db.query.agents.findMany({ where: inArray(agents.id, agentIds) })
    : [];
  const agentMap = new Map(agentInfoList.map(a => [a.id, a]));
  const agentStats = agentIds.map(aid => {
    const agent = agentMap.get(aid);
    const aTasks = agentTasks.filter(t => t.agentId === aid);
    return {
      agentId: aid,
      agentName: agent?.name || aid,
      taskCount: aTasks.length,
      completedTasks: aTasks.filter(t => t.status === 'done').length,
    };
  });

  // PR & Deployment stats (last 4 weeks)
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 3600000);
  const recentPRs = prList.filter(p => new Date(p.updatedAt) >= fourWeeksAgo);
  const mergedPRs = prList.filter(p => p.state === 'merged' || p.state === 'closed');
  const weeklyPRs = Math.round(recentPRs.length / 4 * 10) / 10;

  const successfulDeploys = deploymentList.filter(d => d.status === 'success');
  const recentDeploys = deploymentList.filter(d => new Date(d.createdAt) >= fourWeeksAgo);
  const weeklyDeploys = Math.round(recentDeploys.length / 4 * 10) / 10;

  // Feedback/bug trends
  const bugs = feedbackList.filter(f => f.type === 'bug');
  const openBugs = bugs.filter(b => b.status === 'open');

  // Overall progress
  const totalStages = stageList.length;
  const doneStages = stageList.filter(s => s.status === 'completed').length;
  const progress = totalStages ? Math.round((doneStages / totalStages) * 100) : 0;

  // Estimated completion
  const remainingStages = stageList.filter(s => s.status === 'pending').length;
  const estimatedHours = avgCycleHours > 0 ? Math.round(remainingStages * avgCycleHours * 10) / 10 : 0;

  // Task status distribution
  const taskStats = {
    total: taskList.length,
    todo: taskList.filter(t => t.status === 'todo').length,
    inProgress: taskList.filter(t => t.status === 'in_progress').length,
    done: taskList.filter(t => t.status === 'done').length,
  };

  return NextResponse.json({
    progress,
    totalStages,
    doneStages,
    remainingStages,
    cycleTimes,
    avgCycleHours,
    estimatedHours,
    bottlenecks: {
      rejected: rejectedStages.map(s => ({ step: s.step, name: s.name, reviewNotes: s.reviewNotes })),
      slow: slowStages,
    },
    agentStats,
    prCount: prList.length,
    mergedPRCount: mergedPRs.length,
    recentPRCount: recentPRs.length,
    weeklyPRs,
    deploymentCount: deploymentList.length,
    successfulDeployCount: successfulDeploys.length,
    recentDeployCount: recentDeploys.length,
    weeklyDeploys,
    feedbackCount: feedbackList.length,
    bugCount: bugs.length,
    openBugCount: openBugs.length,
    recentFeedback: feedbackList.slice(0, 5),
    recentActivities: activityList.slice(0, 10),
    agentCount: agentLinkList.length,
    taskStats,
  });
}
