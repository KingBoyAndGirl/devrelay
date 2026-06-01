'use client'

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import type { AgentEvent } from '@/lib/agents/backends/types'

// ── Types ────────────────────────────────────────────────────────

interface Turn {
  id: string
  prompt: string
  events: AgentEvent[]
  status: 'running' | 'done' | 'error' | 'timeout'
  errorMessage?: string
  startedAt: number
  endedAt: number | null
  sessionId?: string
}

interface Conversation {
  id: string
  title: string
  turns: Turn[]
  sessionId?: string
  createdAt: number
  updatedAt: number
}

interface AgentRunnerProps {
  agentId: string
  agentName: string
  onClose: () => void
  projectId?: string
  taskId?: string
  positioned?: 'inline' | 'drawer' | 'floating'
  hideHeader?: boolean
  onConversationChange?: (info: { conversations: Conversation[]; activeConvId: string }) => void
}

export interface AgentRunnerHandle {
  newConversation: () => void
  conversations: Conversation[]
  activeConvId: string
  switchConversation: (id: string) => void
  deleteConversation: (id: string) => void
}

// ── Helpers ──────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function createConversation(): Conversation {
  return {
    id: Date.now().toString(),
    title: '新会话',
    turns: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function loadConversations(agentId: string): { conversations: Conversation[]; activeConvId: string } {
  if (typeof window === 'undefined') return { conversations: [], activeConvId: '' }
  try {
    const raw = localStorage.getItem(`agent-conversations-${agentId}`)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { conversations: [], activeConvId: '' }
}

function saveConversations(agentId: string, conversations: Conversation[], activeConvId: string) {
  try {
    // Strip running turns before saving
    const cleaned = conversations.map(c => ({
      ...c,
      turns: c.turns.filter(t => t.status !== 'running'),
    }))
    localStorage.setItem(`agent-conversations-${agentId}`, JSON.stringify({ conversations: cleaned, activeConvId }))
  } catch {}
}

// ── Component ────────────────────────────────────────────────────

const AgentRunner = forwardRef<AgentRunnerHandle, AgentRunnerProps>(function AgentRunner({ agentId, agentName, onClose, projectId, taskId, positioned = 'inline', hideHeader = false, onConversationChange }, ref) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState('')
  const [activeTurn, setActiveTurn] = useState<Turn | null>(null)
  const [prompt, setPrompt] = useState('')
  const [taskContext, setTaskContext] = useState<{ id: string; title: string; description: string | null } | null>(null)
  const [contextUsed, setContextUsed] = useState(false)
  const [showConvList, setShowConvList] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const convListRef = useRef<HTMLDivElement>(null)

  // Load conversations on mount
  useEffect(() => {
    const { conversations: saved, activeConvId: savedId } = loadConversations(agentId)
    if (saved.length > 0) {
      setConversations(saved)
      setActiveConvId(savedId || saved[saved.length - 1].id)
    } else {
      const conv = createConversation()
      setConversations([conv])
      setActiveConvId(conv.id)
    }
  }, [agentId])

  // Close conv list on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (convListRef.current && !convListRef.current.contains(e.target as Node)) {
        setShowConvList(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Derived state
  const currentConv = conversations.find(c => c.id === activeConvId) || conversations[0]
  const currentTurns = currentConv?.turns || []

  // Save on change
  useEffect(() => {
    if (conversations.length > 0 && activeConvId) {
      saveConversations(agentId, conversations, activeConvId)
      onConversationChange?.({ conversations, activeConvId })
    }
  }, [conversations, activeConvId, agentId, onConversationChange])

  // ── Conversation actions ────────────────────────────────────────

  function handleNewConversation() {
    if (activeTurn?.status === 'running') return
    const conv = createConversation()
    setConversations(prev => [...prev, conv])
    setActiveConvId(conv.id)
    setActiveTurn(null)
    setContextUsed(false)
  }

  function handleSwitchConversation(convId: string) {
    if (convId === activeConvId || activeTurn?.status === 'running') return
    setActiveConvId(convId)
    setActiveTurn(null)
    setShowConvList(false)
  }

  function handleDeleteConversation(convId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (activeTurn?.status === 'running') return
    setConversations(prev => {
      const next = prev.filter(c => c.id !== convId)
      if (next.length === 0) {
        const conv = createConversation()
        setActiveConvId(conv.id)
        return [conv]
      }
      if (convId === activeConvId) {
        setActiveConvId(next[next.length - 1].id)
      }
      return next
    })
    setActiveTurn(null)
  }

  // ── Expose handle ─────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    newConversation: handleNewConversation,
    conversations,
    activeConvId,
    switchConversation: handleSwitchConversation,
    deleteConversation: (id: string) => handleDeleteConversation(id, { stopPropagation: () => {} } as React.MouseEvent),
  }), [conversations, activeConvId, handleNewConversation, handleSwitchConversation])

  // ── Turn management ─────────────────────────────────────────────

  function updateCurrentTurn(turns: Turn[], sessionId?: string) {
    setConversations(prev => prev.map(c => {
      if (c.id !== activeConvId) return c
      const title = c.title === '新会话' && turns.length > 0
        ? turns[0].prompt.slice(0, 30) + (turns[0].prompt.length > 30 ? '...' : '')
        : c.title
      return { ...c, turns, sessionId, title, updatedAt: Date.now() }
    }))
  }

  // ── Task context ────────────────────────────────────────────────

  useEffect(() => {
    if (!taskId) return
    fetch(`/api/tasks/${taskId}`)
      .then(r => r.json())
      .then(data => {
        if (data.id) {
          setTaskContext(data)
          if (!contextUsed) {
            const parts = [`请完成以下任务：${data.title}`]
            if (data.description) parts.push(`\n任务描述：${data.description}`)
            parts.push('\n')
            setPrompt(parts.join(''))
          }
        }
      })
  }, [taskId])

  // ── Scroll ──────────────────────────────────────────────────────

  const scrollToBottom = useCallback((force = false) => {
    const el = scrollRef.current
    if (!el) return
    if (force || !userScrolledUp.current) el.scrollTop = el.scrollHeight
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    userScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight >= 50
  }, [])

  useEffect(() => {
    if (activeTurn?.status === 'running') scrollToBottom(false)
  }, [activeTurn?.events, scrollToBottom])

  // ── Execute ─────────────────────────────────────────────────────

  async function handleRun() {
    const text = prompt.trim()
    if (!text) return

    abortRef.current?.abort()
    setPrompt('')
    if (taskContext && !contextUsed) setContextUsed(true)

    // Get sessionId from current conversation
    const sessionId = currentConv?.sessionId

    const turn: Turn = {
      id: Date.now().toString(),
      prompt: text,
      events: [],
      status: 'running',
      startedAt: Date.now(),
      endedAt: null,
    }
    setActiveTurn(turn)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(`/api/agents/${agentId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, projectId, taskId, sessionId }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const finished: Turn = { ...turn, status: 'error', errorMessage: err.error ?? `HTTP ${res.status}`, endedAt: Date.now() }
        setActiveTurn(finished)
        updateCurrentTurn([...currentTurns, finished])
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue
          try {
            const event = JSON.parse(trimmed.slice(6)) as AgentEvent
            turn.events = [...turn.events, event]

            if (event.type === 'exit') {
              const finalStatus = (event.finalStatus === 'completed' || event.exitCode === 0) ? 'done' : 'error'
              const finished: Turn = {
                ...turn,
                events: [...turn.events],
                status: finalStatus,
                endedAt: Date.now(),
                sessionId: event.sessionId,
              }
              setActiveTurn(finished)
              updateCurrentTurn([...currentTurns, finished], event.sessionId)
              return finished
            }

            setActiveTurn({ ...turn, events: [...turn.events] })
            scrollToBottom(false)
          } catch {}
        }
      }

      // Stream ended without explicit exit event
      const finished: Turn = { ...turn, events: [...turn.events], status: 'done', endedAt: Date.now() }
      setActiveTurn(finished)
      updateCurrentTurn([...currentTurns, finished])
    } catch (err: any) {
      if (err.name === 'AbortError') {
        const finished: Turn = { ...turn, events: [...turn.events], status: 'done', endedAt: Date.now() }
        setActiveTurn(finished)
        updateCurrentTurn([...currentTurns, finished])
      } else {
        const finished: Turn = { ...turn, events: [...turn.events], status: 'error', errorMessage: `连接错误: ${err.message}`, endedAt: Date.now() }
        setActiveTurn(finished)
        updateCurrentTurn([...currentTurns, finished])
      }
    }
  }

  function handleCancel() { abortRef.current?.abort() }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleRun() }
  }

  // ── Render ──────────────────────────────────────────────────────

  const allTurns = [...currentTurns]
  if (activeTurn && !currentTurns.find(t => t.id === activeTurn.id)) allTurns.push(activeTurn)

  const terminal = (
    <div className={`flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden transition-all ${
      positioned === 'floating' ? 'shadow-2xl' : ''
    } ${hideHeader ? 'h-full' : ''}`} style={positioned === 'inline' && !hideHeader ? { height: '70vh', maxHeight: '800px' } : undefined}>
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
              {agentName.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{agentName}</p>
              {activeTurn?.status === 'running' && <p className="text-xs text-blue-600">正在执行...</p>}
            </div>
            {/* Conversation selector */}
            <div className="relative ml-2" ref={convListRef}>
              <button
                onClick={() => setShowConvList(!showConvList)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded px-2 py-1 transition-colors max-w-[150px]"
              >
                <span className="truncate">{currentConv?.title || '新会话'}</span>
                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showConvList && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 max-h-60 overflow-y-auto">
                  <div className="px-3 py-1.5 flex items-center justify-between border-b border-gray-100">
                    <span className="text-xs text-gray-400">会话列表</span>
                    <button onClick={handleNewConversation} className="text-xs text-blue-600 hover:text-blue-800">+ 新建</button>
                  </div>
                  {conversations.slice().reverse().map(conv => (
                    <div
                      key={conv.id}
                      onClick={() => handleSwitchConversation(conv.id)}
                      className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 ${
                        conv.id === activeConvId ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-800 truncate">{conv.title}</p>
                        <p className="text-xs text-gray-400">{formatTime(conv.createdAt)}</p>
                      </div>
                      {conversations.length > 1 && (
                        <button
                          onClick={(e) => handleDeleteConversation(conv.id, e)}
                          className="ml-2 text-gray-300 hover:text-red-500 p-0.5"
                          title="删除会话"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleNewConversation} className="text-gray-400 hover:text-gray-600 text-xs" title="新建会话">+ 新建</button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50/50">
        {allTurns.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
                <span className="text-xl">→</span>
              </div>
              <p className="font-medium text-gray-500">向 {agentName} 发送指令</p>
              <p className="text-xs text-gray-400">Ctrl + Enter 发送</p>
            </div>
          </div>
        )}

        {allTurns.map(turn => (
          <div key={turn.id} className="space-y-4">
            {/* User message */}
            <div className="flex justify-end">
              <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm">
                <p className="text-sm whitespace-pre-wrap break-words">{turn.prompt}</p>
                <p className="text-xs text-blue-200 mt-1">{formatTime(turn.startedAt)}</p>
              </div>
            </div>

            {/* Agent response */}
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1">
                {agentName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                  {/* Status bar */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-500">{agentName}</span>
                    {turn.status === 'running' && (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />执行中
                      </span>
                    )}
                    {turn.status === 'done' && <span className="text-xs text-green-600">完成</span>}
                    {turn.status === 'timeout' && <span className="text-xs text-amber-600">超时</span>}
                    {turn.status === 'error' && <span className="text-xs text-red-600">错误</span>}
                    {turn.endedAt && <span className="text-xs text-gray-400">耗时 {formatDuration(turn.endedAt - turn.startedAt)}</span>}
                  </div>

                  {/* Event content */}
                  <div className="text-sm text-gray-800 space-y-2">
                    <TurnEvents events={turn.events} />

                    {turn.events.length === 0 && turn.status === 'running' && (
                      <div className="flex items-center gap-2 text-gray-400 text-xs">
                        <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                        等待输出...
                      </div>
                    )}

                    {turn.errorMessage && (
                      <div className="bg-red-50 border border-red-100 text-red-700 px-3 py-2 rounded-lg text-xs">{turn.errorMessage}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
        {taskContext && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">{taskContext.title}</span>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 placeholder-gray-400 resize-none bg-gray-50"
            placeholder={`向 ${agentName} 发送指令... (Ctrl+Enter 发送)`}
            rows={2}
            disabled={activeTurn?.status === 'running'}
          />
          <div className="flex gap-1.5">
            {activeTurn?.status === 'running' ? (
              <button onClick={handleCancel} className="px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 whitespace-nowrap transition-colors">
                取消
              </button>
            ) : (
              <button onClick={handleRun} disabled={!prompt.trim()}
                className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap transition-colors">
                发送
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  if (positioned === 'drawer') {
    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
        <div className="fixed bottom-0 left-0 right-0 z-50" style={{ maxHeight: '60vh' }}>{terminal}</div>
      </>
    )
  }
  if (positioned === 'floating') {
    return <div className="fixed bottom-4 right-4 z-50 w-96 max-md:inset-0 max-md:w-full">{terminal}</div>
  }
  return terminal
})

export default AgentRunner

// ── Event Renderer ───────────────────────────────────────────────

function TurnEvents({ events }: { events: AgentEvent[] }) {
  const segments = mergeTextEvents(events)

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          return (
            <p key={i} className="whitespace-pre-wrap break-words leading-relaxed">{seg.content}</p>
          )
        }
        if (seg.kind === 'thinking') {
          return (
            <details key={i} className="group">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-500">思考过程</summary>
              <p className="text-xs text-gray-400 mt-1 pl-2 border-l-2 border-gray-200 whitespace-pre-wrap">{seg.content}</p>
            </details>
          )
        }
        if (seg.kind === 'tool_use') {
          const inputStr = seg.input ? (typeof seg.input === 'string' ? seg.input : JSON.stringify(seg.input, null, 2)) : null
          return (
            <details key={i} className="group">
              <summary className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 cursor-pointer hover:bg-purple-100 font-mono">
                <span>🔧</span> {seg.tool ?? 'tool'}
              </summary>
              {inputStr && (
                <pre className="text-xs text-gray-500 mt-1 pl-4 whitespace-pre-wrap font-mono">
                  {inputStr}
                </pre>
              )}
            </details>
          )
        }
        if (seg.kind === 'tool_result') {
          return (
            <p key={i} className="text-xs text-gray-400 pl-2 border-l-2 border-gray-200 whitespace-pre-wrap line-clamp-3">{seg.output}</p>
          )
        }
        if (seg.kind === 'error') {
          return (
            <div key={i} className="bg-red-50 border border-red-100 text-red-700 px-3 py-2 rounded-lg text-xs">{seg.content}</div>
          )
        }
        return null
      })}
    </>
  )
}

// ── Segment merging ──────────────────────────────────────────────

type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'thinking'; content: string }
  | { kind: 'tool_use'; tool?: string; input?: unknown }
  | { kind: 'tool_result'; tool?: string; output?: string }
  | { kind: 'error'; content?: string }

function mergeTextEvents(events: AgentEvent[]): Segment[] {
  const segments: Segment[] = []
  let textBuf = ''

  const flushText = () => {
    if (textBuf) {
      segments.push({ kind: 'text', content: textBuf })
      textBuf = ''
    }
  }

  for (const ev of events) {
    switch (ev.type) {
      case 'text':
        textBuf += ev.content ?? ''
        break
      case 'thinking':
        flushText()
        segments.push({ kind: 'thinking', content: ev.content ?? '' })
        break
      case 'tool_use':
        flushText()
        segments.push({ kind: 'tool_use', tool: ev.tool, input: ev.input })
        break
      case 'tool_result':
        flushText()
        segments.push({ kind: 'tool_result', tool: ev.tool, output: ev.output })
        break
      case 'error':
        flushText()
        segments.push({ kind: 'error', content: ev.content })
        break
      case 'status':
      case 'exit':
        break
      default: {
        const anyEv = ev as any
        if (anyEv.type === 'stdout' && anyEv.data) {
          textBuf += anyEv.data
        } else if (anyEv.type === 'stderr' && anyEv.data) {
          const diagPatterns = [/^Reading additional/i, /^OpenAI Codex/i, /^workdir:/i, /^model:/i, /^provider:/i, /^approval:/i, /^sandbox:/i, /^reasoning/i, /^session id:/i, /^-{3,}/, /^warning:/i, /^tokens used/i, /^\d{1,3}(,\d{3})*$/, /^Claude Code/i, /^Hermes v/i, /^user$/, /^assistant$/, /^codex$/i]
          const lines = anyEv.data.split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            if (diagPatterns.some(p => p.test(trimmed))) continue
            textBuf += trimmed + '\n'
          }
        }
        break
      }
    }
  }
  flushText()
  return segments
}
