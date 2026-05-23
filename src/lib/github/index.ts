import { Octokit } from 'octokit';
import { config } from '@/lib/config';

export function createOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}

export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    scope: 'repo,workflow,admin:repo_hook',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: config.github.clientId,
      client_secret: config.github.clientSecret,
      code,
    }),
  });

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : undefined,
  };
}

export async function listRepos(octokit: Octokit): Promise<Array<{
  name: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
}>> {
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: 'updated',
    per_page: 100,
  });

  return data.map((r) => ({
    name: r.name,
    fullName: r.full_name,
    cloneUrl: r.clone_url,
    defaultBranch: r.default_branch,
    private: r.private,
  }));
}

export async function getRepo(octokit: Octokit, owner: string, repo: string) {
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data;
}

export async function listIssues(
  octokit: Octokit,
  owner: string,
  repo: string,
  opts?: { state?: 'open' | 'closed' | 'all'; perPage?: number }
) {
  const { data } = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: opts?.state || 'open',
    per_page: opts?.perPage || 50,
  });
  return data;
}

export async function createWebhook(
  octokit: Octokit,
  owner: string,
  repo: string,
  webhookUrl: string,
  secret: string
) {
  const { data } = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    config: {
      url: webhookUrl,
      content_type: 'json',
      secret,
    },
    events: ['push', 'issues', 'pull_request', 'pull_request_review'],
  });
  return data;
}

export async function verifyToken(octokit: Octokit): Promise<{ login: string; valid: boolean }> {
  try {
    const { data } = await octokit.rest.users.getAuthenticated();
    return { login: data.login, valid: true };
  } catch {
    return { login: '', valid: false };
  }
}
