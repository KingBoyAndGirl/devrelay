import 'dotenv/config';

export const config = {
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPass: process.env.ADMIN_PASS || 'devrelay2026',
  databasePath: process.env.DATABASE_PATH || './data/devrelay.db',
  dataDir: process.env.DATA_DIR || './data',
  nextauthUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  nextauthSecret: process.env.NEXTAUTH_SECRET || 'devrelay-secret-change-me',
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    callbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/auth/callback/github',
  },
  agents: {
    claudeCodePath: process.env.CLAUDE_CODE_PATH || 'claude',
    codexPath: process.env.CODEX_PATH || 'codex',
    hermesPath: process.env.HERMES_PATH || 'hermes',
  },
};
