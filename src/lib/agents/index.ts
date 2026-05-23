export type AgentType = 'claude_code' | 'codex' | 'hermes' | 'openclaw' | 'custom';

export const AGENT_TYPES: Record<AgentType, { name: string; defaultPath: string; defaultArgs: string }> = {
  claude_code: {
    name: 'Claude Code',
    defaultPath: 'claude',
    defaultArgs: '-p "{prompt}" --output-format stream-json',
  },
  codex: {
    name: 'Codex CLI',
    defaultPath: 'codex',
    defaultArgs: '{prompt}',
  },
  hermes: {
    name: 'Hermes',
    defaultPath: 'hermes',
    defaultArgs: '--prompt "{prompt}"',
  },
  openclaw: {
    name: 'OpenClaw',
    defaultPath: 'openclaw',
    defaultArgs: '{prompt}',
  },
  custom: {
    name: '自定义 Agent',
    defaultPath: '',
    defaultArgs: '{prompt}',
  },
};

export interface AgentSpawnConfig {
  execPath: string;
  argsTemplate: string;
  envVars: Record<string, string>;
  cwd?: string;
}
