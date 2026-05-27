import type { AgentBackend, AgentBackendConfig, AgentEvent, ParserState } from './types'

/**
 * Claude Code backend.
 *
 * CLI:  claude -p "{prompt}" --output-format stream-json --verbose
 * Protocol: NDJSON, each line is a JSON object with `type` field.
 *
 * Event types we care about:
 *   - system   (session_id, early status)
 *   - assistant (message.content[] → text / thinking / tool_use)
 *   - user     (message.content[] → tool_result)
 *   - result   (final: subtype=success/error, session_id, usage)
 *
 * References: multica server/pkg/agent/claude.go
 */
export const claudeBackend: AgentBackend = {
  name: 'claude',
  defaultArgs: '-p "{prompt}" --output-format stream-json --verbose',
  defaultTimeoutMs: 600_000,
  defaultEnvKeys: ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY'],

  buildArgs(prompt: string, config: AgentBackendConfig): string[] {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose']
    if (config.sessionId) {
      args.push('--resume', config.sessionId)
    }
    return args
  },

  parseLine(line: string, state: ParserState): AgentEvent | null {
    const trimmed = line.trim()
    if (!trimmed) return null

    let msg: any
    try {
      msg = JSON.parse(trimmed)
    } catch {
      return null
    }

    switch (msg.type) {
      case 'system': {
        if (msg.session_id) {
          state.sessionId = msg.session_id
          return { type: 'status', status: 'session', sessionId: msg.session_id }
        }
        return null
      }

      case 'assistant': {
        const content = msg.message?.content
        if (!Array.isArray(content)) return null
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            state.output += block.text
            return { type: 'text', content: block.text }
          }
          if (block.type === 'thinking' && block.thinking) {
            return { type: 'thinking', content: block.thinking }
          }
          if (block.type === 'tool_use') {
            return {
              type: 'tool_use',
              tool: block.name,
              callId: block.id,
              input: block.input ?? {},
            }
          }
        }
        return null
      }

      case 'user': {
        const content = msg.message?.content
        if (!Array.isArray(content)) return null
        for (const block of content) {
          if (block.type === 'tool_result') {
            const text = typeof block.content === 'string'
              ? block.content
              : JSON.stringify(block.content ?? '')
            return { type: 'tool_result', callId: block.tool_use_id, output: text }
          }
        }
        return null
      }

      case 'result': {
        if (msg.session_id) state.sessionId = msg.session_id
        state.finalStatus = msg.is_error ? 'failed' : 'completed'
        if (msg.is_error && msg.result) {
          return { type: 'error', content: msg.result }
        }
        return null
      }

      default:
        return null
    }
  },

  onEnd(state: ParserState): AgentEvent | null {
    return {
      type: 'exit',
      finalStatus: state.finalStatus ?? 'completed',
    }
  },
}
