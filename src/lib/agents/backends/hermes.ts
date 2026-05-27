import type { AgentBackend, AgentBackendConfig, AgentEvent, ParserState } from './types'

/**
 * Hermes backend — one-shot CLI mode.
 *
 * CLI:  hermes -z "{prompt}" chat
 * Output: plain text to stdout.
 *
 * References: multica server/pkg/agent/hermes.go (ACP daemon mode),
 *             but we use CLI mode for simplicity.
 */
export const hermesBackend: AgentBackend = {
  name: 'hermes',
  defaultArgs: '-z "{prompt}" chat',
  defaultTimeoutMs: 600_000,
  defaultEnvKeys: ['HERMES_BASE_URL', 'HERMES_API_KEY'],

  buildArgs(prompt: string, _config: AgentBackendConfig): string[] {
    return ['-z', prompt, 'chat']
  },

  parseLine(line: string, state: ParserState): AgentEvent | null {
    const trimmed = line.trim()
    if (!trimmed) return null

    // Try JSON parse first (in case hermes emits structured output)
    try {
      const obj = JSON.parse(trimmed)
      if (typeof obj === 'object' && obj !== null) {
        // ACP session/update format
        const method: string = obj.method ?? ''
        if (method === 'session/update' || method === 'session/notification') {
          const update = obj.params?.update ?? {}
          const updateType = normalizeACPType(update.sessionUpdate ?? update.type ?? '')
          if (updateType === 'agent_message_chunk') {
            const text = update.content?.text ?? ''
            if (text) { state.output += text; return { type: 'text', content: text } }
          }
          if (updateType === 'agent_thought_chunk') {
            const text = update.content?.text ?? ''
            if (text) return { type: 'thinking', content: text }
          }
          if (updateType === 'turn_end') {
            state.finalStatus = 'completed'
            return null
          }
        }
        // OpenAI-style chat completion response
        if (obj.choices?.[0]?.message?.content) {
          const text = obj.choices[0].message.content
          state.output += text
          return { type: 'text', content: text }
        }
        if (obj.choices?.[0]?.finish_reason === 'stop') {
          state.finalStatus = 'completed'
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

function normalizeACPType(t: string): string {
  const key = t.toLowerCase().replace(/[_\-\s]/g, '')
  const map: Record<string, string> = {
    agentmessagechunk: 'agent_message_chunk',
    agentthoughtchunk: 'agent_thought_chunk',
    toolcall: 'tool_call',
    toolcallupdate: 'tool_call_update',
    usageupdate: 'usage_update',
    turnend: 'turn_end',
    endturn: 'turn_end',
  }
  return map[key] ?? ''
}
