// Re-export everything from the unified backend system
export { getBackend, getBackendForCLI, AGENT_TYPE_META } from './backends/registry'
export type { AgentType } from './backends/registry'
export type { AgentEvent, AgentBackend, AgentBackendConfig, ParserState } from './backends/types'

// Alias for backward compat — pages use AGENT_TYPES
export { AGENT_TYPE_META as AGENT_TYPES } from './backends/registry'

// CLI binary list for sidecar discovery
export const CLI_BINARIES = [
  'claude', 'codex', 'copilot', 'openclaw', 'opencode',
  'hermes', 'gemini', 'pi', 'cursor-agent', 'kimi', 'kiro-cli',
] as const

// Environment key metadata for UI labels
export const ENV_KEY_META: Record<string, { label: string; placeholder: string }> = {
  ANTHROPIC_BASE_URL: { label: 'API URL', placeholder: 'https://api.anthropic.com' },
  ANTHROPIC_API_KEY: { label: 'API Key', placeholder: 'sk-ant-...' },
  AXONHUB_BASE_URL: { label: 'API URL', placeholder: 'https://api.openai.com/v1' },
  AXONHUB_API_KEY: { label: 'API Key', placeholder: 'ah-...' },
  HERMES_BASE_URL: { label: 'API URL', placeholder: 'https://api.openai.com/v1' },
  HERMES_API_KEY: { label: 'API Key', placeholder: 'sk-...' },
  PROVIDER_BASE_URL: { label: 'API URL', placeholder: 'https://api.openai.com/v1' },
  OPENAI_API_KEY: { label: 'API Key', placeholder: 'sk-...' },
}

export function isApiKeyField(key: string): boolean {
  return key.includes('API_KEY') || key.endsWith('_KEY')
}

export function getEnvKeyLabel(key: string): string {
  return ENV_KEY_META[key]?.label ?? key
}

export function getEnvKeyPlaceholder(key: string): string {
  return ENV_KEY_META[key]?.placeholder ?? ''
}

// Re-export from spawn
export type { AgentSpawnConfig } from './spawn'
export { buildSpawnConfig, classifyStderr } from './spawn'

// Re-export discover (unchanged)
export { discoverCLIs } from './discover'
