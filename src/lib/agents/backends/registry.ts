import type { AgentBackend } from './types'
import { claudeBackend } from './claude'
import { codexBackend } from './codex'
import { hermesBackend } from './hermes'
import { openclawBackend } from './openclaw'

export type AgentType = 'claude_code' | 'codex' | 'hermes' | 'openclaw'

const backends: Record<string, AgentBackend> = {
  claude_code: claudeBackend,
  codex: codexBackend,
  hermes: hermesBackend,
  openclaw: openclawBackend,
}

export function getBackend(type: string): AgentBackend {
  const b = backends[type]
  if (!b) throw new Error(`Unknown agent type: ${type}. Available: ${Object.keys(backends).join(', ')}`)
  return b
}

export function getBackendForCLI(cliName: string): { backend: AgentBackend; type: string } | null {
  for (const [type, b] of Object.entries(backends)) {
    if (cliName === b.name || cliName === type) return { backend: b, type }
  }
  return null
}

export const AGENT_TYPE_META: Record<string, {
  name: string
  defaultPath: string
  defaultArgs: string
  defaultTimeoutMs: number
  defaultEnvKeys: string[]
}> = {
  claude_code: {
    name: 'Claude Code',
    defaultPath: 'claude',
    defaultArgs: claudeBackend.defaultArgs,
    defaultTimeoutMs: claudeBackend.defaultTimeoutMs,
    defaultEnvKeys: claudeBackend.defaultEnvKeys,
  },
  codex: {
    name: 'Codex CLI',
    defaultPath: 'codex',
    defaultArgs: codexBackend.defaultArgs,
    defaultTimeoutMs: codexBackend.defaultTimeoutMs,
    defaultEnvKeys: codexBackend.defaultEnvKeys,
  },
  hermes: {
    name: 'Hermes',
    defaultPath: 'hermes',
    defaultArgs: hermesBackend.defaultArgs,
    defaultTimeoutMs: hermesBackend.defaultTimeoutMs,
    defaultEnvKeys: hermesBackend.defaultEnvKeys,
  },
  openclaw: {
    name: 'OpenClaw',
    defaultPath: 'openclaw',
    defaultArgs: openclawBackend.defaultArgs,
    defaultTimeoutMs: openclawBackend.defaultTimeoutMs,
    defaultEnvKeys: openclawBackend.defaultEnvKeys,
  },
}
