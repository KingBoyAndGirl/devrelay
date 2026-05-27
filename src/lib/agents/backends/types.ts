// Unified agent backend types — inspired by multica's agent.Backend interface.
// All CLI backends normalize their output into these event types.

export type AgentEventType =
  | 'text'         // assistant text output
  | 'thinking'     // reasoning / chain-of-thought
  | 'tool_use'     // tool invocation start
  | 'tool_result'  // tool invocation result
  | 'status'       // lifecycle status (session ready, etc.)
  | 'error'        // error message
  | 'exit'         // process exit (terminal event)

export interface AgentEvent {
  type: AgentEventType
  content?: string   // text, thinking, error content
  tool?: string      // tool_use / tool_result: tool name
  callId?: string    // tool_use / tool_result: call correlation id
  input?: Record<string, unknown>  // tool_use: tool arguments
  output?: string    // tool_result: tool output
  status?: string    // status: running / session / ...
  sessionId?: string // status: backend session id
  exitCode?: number  // exit: process exit code
  finalStatus?: 'completed' | 'failed' | 'timeout' | 'aborted'
}

export interface AgentBackendConfig {
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  sessionId?: string  // resume a previous session
  model?: string
}

export interface AgentBackend {
  readonly name: string
  readonly defaultArgs: string
  readonly defaultTimeoutMs: number
  readonly defaultEnvKeys: string[]

  /** Build CLI arguments for the given prompt + config. */
  buildArgs(prompt: string, config: AgentBackendConfig): string[]

  /**
   * Parse stdout line-by-line from the CLI process.
   * Yields normalized AgentEvents. The caller is responsible for spawning
   * the process and feeding lines — the backend only owns parsing logic.
   */
  parseLine(line: string, state: ParserState): AgentEvent | null

  /**
   * Called when stdout EOF is reached. May yield a final event
   * (e.g. exit with accumulated status).
   */
  onEnd(state: ParserState): AgentEvent | null
}

/** Mutable parser state carried across lines within a single execution. */
export interface ParserState {
  sessionId?: string
  finalStatus?: 'completed' | 'failed' | 'timeout' | 'aborted'
  output: string
  pendingTools: Map<string, { name: string; input?: Record<string, unknown>; argsText: string }>
  model?: string
  turnStarted: boolean
}
