'use client'

import { useState, useRef, useEffect } from 'react'
import { useFloatingAgent } from './FloatingAgentContext'
import AgentRunner from './AgentRunner'

export default function FloatingAgentChat() {
  const { agents, selectedAgent, isOpen, isLoading, selectAgent, toggleChat, closeChat } = useFloatingAgent()
  const [showSelector, setShowSelector] = useState(false)
  const selectorRef = useRef<HTMLDivElement>(null)

  // Close selector on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setShowSelector(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (isLoading) return null

  return (
    <>
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
        <div className="fixed bottom-6 right-6 z-50 w-96 max-md:inset-0 max-md:w-full">
          <div className="flex flex-col bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden" style={{ height: '600px', maxHeight: '80vh' }}>
            {/* Header with Agent Selector */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b shrink-0">
              <div className="flex items-center gap-3 min-w-0" ref={selectorRef}>
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

                  {/* Agent Selector Dropdown */}
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
              <button
                onClick={closeChat}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {/* Agent Runner */}
            <div className="flex-1 overflow-hidden">
              <AgentRunner
                agentId={selectedAgent.id}
                agentName={selectedAgent.name}
                onClose={closeChat}
                positioned="inline"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
