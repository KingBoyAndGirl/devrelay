import type { AgentBackend, AgentBackendConfig, AgentEvent, ParserState } from './types'

/**
 * Codex CLI backend — one-shot CLI mode.
 *
 * CLI:  codex exec "{prompt}"
 * Output: plain text to stdout (no JSON protocol).
 *
 * References: multica server/pkg/agent/codex.go (daemon mode),
 *             but we use CLI mode for simplicity.
 */
export const codexBackend: AgentBackend = {
  name: 'codex',
  defaultArgs: 'exec "{prompt}"',
  defaultTimeoutMs: 600_000,
  defaultEnvKeys: ['AXONHUB_BASE_URL', 'AXONHUB_API_KEY'],

  buildArgs(prompt: string, _config: AgentBackendConfig): string[] {
    return ['exec', prompt]
  },

  parseLine(line: string, state: ParserState): AgentEvent | null {
    const trimmed = line.trim()
    if (!trimmed) return null

    // Try JSON parse first (in case codex emits structured output)
    try {
      const obj = JSON.parse(trimmed)
      if (typeof obj === 'object' && obj !== null) {
        // Handle codex event format
        if (obj.type === 'agent_message' && obj.message) {
          const text = typeof obj.message === 'string' ? obj.message : obj.message.content ?? ''
          if (text) { state.output += text; return { type: 'text', content: text } }
        }
        if (obj.type === 'result') {
          state.finalStatus = obj.is_error ? 'failed' : 'completed'
          return null
        }
      }
    } catch {
      // Not JSON — plain text line
    }

    // Plain text output
    state.output += trimmed + '\n'
    return { type: 'text', content: trimmed }
  },

  onEnd(state: ParserState): AgentEvent | null {
    return { type: 'exit', finalStatus: state.finalStatus ?? 'completed' }
  },
}
