export type AgentType = 'claude_code' | 'codex' | 'hermes' | 'openclaw' | 'custom';

export const CLI_BINARIES = [
  'claude',
  'codex',
  'copilot',
  'openclaw',
  'opencode',
  'hermes',
  'gemini',
  'pi',
  'cursor-agent',
  'kimi',
  'kiro-cli',
] as const;

export const AGENT_TYPES: Record<AgentType, {
  name: string;
  defaultPath: string;
  defaultArgs: string;
  defaultTimeoutMs: number;
  defaultEnvKeys: string[];
}> = {
  claude_code: {
    name: 'Claude Code',
    defaultPath: 'claude',
    defaultArgs: '-p "{prompt}" --output-format stream-json --verbose',
    defaultTimeoutMs: 600_000,
    defaultEnvKeys: ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY'],
  },
  codex: {
    name: 'Codex CLI',
    defaultPath: 'codex',
    defaultArgs: 'exec "{prompt}"',
    defaultTimeoutMs: 600_000,
    defaultEnvKeys: ['AXONHUB_BASE_URL', 'AXONHUB_API_KEY'],
  },
  hermes: {
    name: 'Hermes',
    defaultPath: 'hermes',
    defaultArgs: '--prompt "{prompt}"',
    defaultTimeoutMs: 600_000,
    defaultEnvKeys: ['HERMES_BASE_URL', 'HERMES_API_KEY'],
  },
  openclaw: {
    name: 'OpenClaw',
    defaultPath: 'openclaw',
    defaultArgs: '{prompt}',
    defaultTimeoutMs: 600_000,
    defaultEnvKeys: ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY'],
  },
  custom: {
    name: '自定义 Agent',
    defaultPath: '',
    defaultArgs: '{prompt}',
    defaultTimeoutMs: 600_000,
    defaultEnvKeys: ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY'],
  },
};

export const ENV_KEY_META: Record<string, { label: string; placeholder: string }> = {
  ANTHROPIC_BASE_URL: { label: 'API URL', placeholder: 'https://api.anthropic.com' },
  ANTHROPIC_API_KEY: { label: 'API Key', placeholder: 'sk-ant-...' },
  AXONHUB_BASE_URL: { label: 'API URL', placeholder: 'https://api.openai.com/v1' },
  AXONHUB_API_KEY: { label: 'API Key', placeholder: 'ah-...' },
  HERMES_BASE_URL: { label: 'API URL', placeholder: 'https://api.openai.com/v1' },
  HERMES_API_KEY: { label: 'API Key', placeholder: 'sk-...' },
  PROVIDER_BASE_URL: { label: 'API URL', placeholder: 'https://api.openai.com/v1' },
};

export function isApiKeyField(key: string): boolean {
  return key.includes('API_KEY') || key.endsWith('_KEY');
}

export function getEnvKeyLabel(key: string): string {
  return ENV_KEY_META[key]?.label || '';
}

export function getEnvKeyPlaceholder(key: string): string {
  return ENV_KEY_META[key]?.placeholder || '';
}

export interface AgentSpawnConfig {
  execPath: string;
  argsTemplate: string;
  envVars: Record<string, string>;
  cwd?: string;
  timeoutMs: number;
}

export interface AgentRunResult {
  output: string;
  errors: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}

export interface AgentStreamEvent {
  type: 'stdout' | 'stderr' | 'exit' | 'timeout' | 'error';
  data?: string;
  exitCode?: number | null;
  error?: string;
}
