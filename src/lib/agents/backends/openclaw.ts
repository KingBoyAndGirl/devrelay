import type { AgentBackend, AgentBackendConfig, AgentEvent, ParserState } from './types'

/**
 * OpenClaw backend.
 *
 * CLI:  openclaw agent "{prompt}" --json
 * Protocol: Two modes:
 *   1. Whole-buffer JSON (2026.5.x): single pretty-printed JSON blob with
 *      payloads + meta (stopReason, usage, model, sessionId)
 *   2. NDJSON streaming: one JSON object per line with type field:
 *      text / tool_use / tool_result / error / step_start / step_finish
 *
 * References: multica server/pkg/agent/openclaw.go
 */
export const openclawBackend: AgentBackend = {
  name: 'openclaw',
  defaultArgs: 'agent "{prompt}" --json',
  defaultTimeoutMs: 600_000,
  defaultEnvKeys: ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY'],

  buildArgs(prompt: string, _config: AgentBackendConfig): string[] {
    return ['agent', prompt, '--json']
  },

  parseLine(line: string, state: ParserState): AgentEvent | null {
    const trimmed = line.trim()
    if (!trimmed) return null

    let obj: any
    try {
      obj = JSON.parse(trimmed)
    } catch {
      return null
    }

    // Final result blob (openclaw 2026.5.x format)
    if (obj.payloads && obj.meta) {
      return this._handleResultBlob(obj, state)
    }

    // NDJSON streaming event
    const eventType: string = obj.type ?? ''
    switch (eventType) {
      case 'text': {
        const text = obj.text ?? ''
        if (!text) return null
        state.output += text
        return { type: 'text', content: text }
      }
      case 'tool_use': {
        let input: Record<string, unknown> | undefined
        if (obj.input) {
          try { input = typeof obj.input === 'string' ? JSON.parse(obj.input) : obj.input } catch {}
        }
        return {
          type: 'tool_use',
          tool: obj.tool ?? obj.name,
          callId: obj.callId ?? obj.call_id,
          input: input ?? {},
        }
      }
      case 'tool_result':
        return {
          type: 'tool_result',
          tool: obj.tool ?? obj.name,
          callId: obj.callId ?? obj.call_id,
          output: obj.text ?? obj.output ?? '',
        }
      case 'error':
        state.finalStatus = 'failed'
        return { type: 'error', content: obj.error?.message ?? obj.message ?? obj.text ?? '' }
      case 'step_start':
        return { type: 'status', status: 'running' }
      case 'step_finish':
        return null
      default:
        return null
    }
  },

  _handleResultBlob(obj: any, state: ParserState): AgentEvent | null {
    const meta = obj.meta ?? {}
    state.sessionId = meta.sessionId ?? meta.session_id

    const stopReason: string = meta.stopReason ?? meta.finishReason ?? ''
    if (stopReason === 'stop' || stopReason === 'end_turn') {
      state.finalStatus = 'completed'
    } else if (stopReason === 'cancelled') {
      state.finalStatus = 'aborted'
    } else {
      state.finalStatus = 'completed'
    }

    // Extract assistant text from payloads
    const payloads: any[] = Array.isArray(obj.payloads) ? obj.payloads : []
    for (const p of payloads) {
      if (p.role === 'assistant' && p.content) {
        for (const block of (Array.isArray(p.content) ? p.content : [])) {
          if (block.type === 'text' && block.text) {
            state.output += block.text
            return { type: 'text', content: block.text }
          }
        }
      }
    }
    return null
  },

  onEnd(state: ParserState): AgentEvent | null {
    return {
      type: 'exit',
      finalStatus: state.finalStatus ?? 'completed',
      sessionId: state.sessionId,
    }
  },
}
