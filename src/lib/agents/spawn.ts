import { spawn, ChildProcess } from 'child_process';
import { AGENT_TYPES, AgentSpawnConfig, AgentType } from './index';

export function buildSpawnConfig(agent: {
  type: string;
  execPath: string | null;
  argsTemplate: string | null;
  envVars: string | null;
}): AgentSpawnConfig {
  const typeInfo = AGENT_TYPES[agent.type as AgentType] || AGENT_TYPES.custom;

  const envVars: Record<string, string> = {};
  if (agent.envVars) {
    try {
      Object.assign(envVars, JSON.parse(agent.envVars));
    } catch { /* ignore parse errors */ }
  }

  return {
    execPath: agent.execPath || typeInfo.defaultPath,
    argsTemplate: agent.argsTemplate || typeInfo.defaultArgs,
    envVars,
  };
}

export function runAgent(
  config: AgentSpawnConfig,
  prompt: string
): ChildProcess {
  const args = config.argsTemplate
    .replace('{prompt}', prompt)
    .split(/\s+/)
    .filter(Boolean);

  const child = spawn(config.execPath, args, {
    env: { ...process.env, ...config.envVars },
    cwd: config.cwd || process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return child;
}
