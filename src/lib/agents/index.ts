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
}> = {
  claude_code: {
    name: 'Claude Code',
    defaultPath: 'claude',
    defaultArgs: '-p "{prompt}" --output-format stream-json --verbose',
    defaultTimeoutMs: 600_000,
  },
  codex: {
    name: 'Codex CLI',
    defaultPath: 'codex',
    defaultArgs: 'exec "{prompt}"',
    defaultTimeoutMs: 600_000,
  },
  hermes: {
    name: 'Hermes',
    defaultPath: 'hermes',
    defaultArgs: '--prompt "{prompt}"',
    defaultTimeoutMs: 600_000,
  },
  openclaw: {
    name: 'OpenClaw',
    defaultPath: 'openclaw',
    defaultArgs: '{prompt}',
    defaultTimeoutMs: 600_000,
  },
  custom: {
    name: '自定义 Agent',
    defaultPath: '',
    defaultArgs: '{prompt}',
    defaultTimeoutMs: 600_000,
  },
};

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
