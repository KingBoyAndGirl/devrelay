'use client'

import { useState, useRef, useEffect } from 'react'
import { useFloatingAgent } from './FloatingAgentContext'
import AgentRunner from './AgentRunner'

const MIN_W = 320
const MIN_H = 360
const SIDEBAR_W = 256
const GAP = 24
const DEFAULT_W = 384
const DEFAULT_H = 600

const CURSOR_MAP: Record<string, string> = {
  nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize',
  n: 'ns-resize', s: 'ns-resize', w: 'ew-resize', e: 'ew-resize',
}

export default function FloatingAgentChat() {
  const { agents, selectedAgent, isOpen, isLoading, selectAgent, toggleChat, closeChat } = useFloatingAgent()
  const [showSelector, setShowSelector] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H })
  const selectorRef = useRef<HTMLDivElement>(null)

  // Refs for resize state (persist across re-renders)
  const resizing = useRef(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const startW = useRef(0)
  const startH = useRef(0)
  const handleRef = useRef('')

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setShowSelector(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Resize drag — stable effect, no size dependency
  useEffect(() => {
    if (maximized || !isOpen) return

    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return
      e.preventDefault()
      const dx = startX.current - e.clientX
      const dy = startY.current - e.clientY
      const h = handleRef.current
      const maxW = window.innerWidth - SIDEBAR_W - GAP * 2
      const maxH = window.innerHeight - GAP * 2

      if (h.includes('e') || h.includes('w')) {
        const newW = h.includes('w')
          ? Math.max(MIN_W, Math.min(startW.current + dx, maxW))
          : Math.max(MIN_W, Math.min(startW.current - dx, maxW))
        setSize(s => ({ ...s, w: newW }))
      }
      if (h.includes('n') || h.includes('s')) {
        const newH = h.includes('n')
          ? Math.max(MIN_H, Math.min(startH.current + dy, maxH))
          : Math.max(MIN_H, Math.min(startH.current - dy, maxH))
        setSize(s => ({ ...s, h: newH }))
      }
    }

    const onUp = () => {
      if (!resizing.current) return
      resizing.current = false
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    const container = document.getElementById('floating-chat-window')
    if (!container) return

    const onContainerDown = (e: Event) => {
      const me = e as MouseEvent
      const target = me.target as HTMLElement
      const handleEl = target.closest('[data-resize-handle]') as HTMLElement | null
      if (!handleEl) return
      me.preventDefault()
      resizing.current = true
      startX.current = me.clientX
      startY.current = me.clientY
      startW.current = size.w
      startH.current = size.h
      handleRef.current = handleEl.dataset.resizeHandle!
      document.body.style.userSelect = 'none'
      document.body.style.cursor = CURSOR_MAP[handleRef.current] || 'default'
    }

    container.addEventListener('mousedown', onContainerDown)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)

    return () => {
      container.removeEventListener('mousedown', onContainerDown)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [maximized, isOpen])

  if (isLoading) return null

  return (
    <div className="contents">
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={toggleChat}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 flex items-center justify-center"
          title="打开 Agent 对话"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && selectedAgent && (
        <div
          id="floating-chat-window"
          className="flex flex-col overflow-hidden border border-gray-200 rounded-xl shadow-2xl bg-white"
          style={maximized ? {
            position: 'absolute',
            inset: `${GAP}px`,
            zIndex: 50,
          } : {
            position: 'fixed',
            bottom: `${GAP}px`,
            right: `${GAP}px`,
            zIndex: 50,
            width: size.w,
            height: size.h,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b shrink-0 relative z-20">
            {/* Drag handle (top-left corner) */}
            {!maximized && (
              <div
                data-resize-handle="nw"
                className="absolute top-0 left-0 w-10 h-10 cursor-nwse-resize z-30 group"
              >
                <svg className="absolute top-1.5 left-1.5 w-2.5 h-2.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 10 10">
                  <path d="M0 10L10 0" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  <path d="M0 5L5 0" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </div>
            )}

            {/* Agent info + selector */}
            <div className="flex items-center gap-3 min-w-0 ml-4" ref={selectorRef}>
              <div className="relative">
                <button
                  onClick={() => setShowSelector(!showSelector)}
                  className="flex items-center gap-2 hover:bg-gray-100 rounded-lg px-2 py-1 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                    {selectedAgent.name.charAt(0)}
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-medium text-gray-900 truncate">{selectedAgent.name}</p>
                    <p className="text-xs text-gray-500">{selectedAgent.type}</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showSelector && agents.length > 1 && (
                  <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10">
                    {agents.map(agent => (
                      <button
                        key={agent.id}
                        onClick={() => {
                          selectAgent(agent)
                          setShowSelector(false)
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                          agent.id === selectedAgent.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                          {agent.name.charAt(0)}
                        </div>
                        <span className="truncate">{agent.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMaximized(m => !m)}
                className="p-1.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                title={maximized ? '缩小' : '放大'}
              >
                {maximized ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
                )}
              </button>
              <button
                onClick={closeChat}
                className="p-1.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                title="关闭"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Agent Runner */}
          <div className="flex-1 overflow-hidden">
            <AgentRunner
              agentId={selectedAgent.id}
              agentName={selectedAgent.name}
              onClose={closeChat}
              positioned="inline"
              hideHeader={true}
            />
          </div>

          {/* Resize handles (only in normal mode) */}
          {!maximized && (
            <>
              {/* Top edge */}
              <div data-resize-handle="n" className="absolute top-0 left-10 right-10 h-2.5 cursor-ns-resize z-30" />
              {/* Left edge */}
              <div data-resize-handle="w" className="absolute top-10 left-0 w-1.5 bottom-0 cursor-ew-resize z-30" />
              {/* Top-right corner */}
              <div data-resize-handle="ne" className="absolute top-0 right-0 w-10 h-10 cursor-nesw-resize z-30 group">
                <svg className="absolute top-1.5 right-1.5 w-2.5 h-2.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 10 10">
                  <path d="M10 10L0 0" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  <path d="M10 5L5 0" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </div>
              {/* Bottom-left corner */}
              <div data-resize-handle="sw" className="absolute bottom-0 left-0 w-10 h-10 cursor-nesw-resize z-30 group">
                <svg className="absolute bottom-1.5 left-1.5 w-2.5 h-2.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 10 10">
                  <path d="M0 0L10 10" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  <path d="M0 5L5 10" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </div>
              {/* Right edge */}
              <div data-resize-handle="e" className="absolute top-10 right-0 w-1.5 bottom-10 cursor-ew-resize z-30" />
              {/* Bottom edge */}
              <div data-resize-handle="s" className="absolute bottom-0 left-10 right-10 h-2.5 cursor-ns-resize z-30" />
            </>
          )}
        </div>
      )}
    </div>
  )
}
