'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

interface Agent {
  id: string
  name: string
  type: string
  enabled: boolean
}

interface FloatingAgentContextType {
  agents: Agent[]
  selectedAgent: Agent | null
  isOpen: boolean
  isLoading: boolean
  selectAgent: (agent: Agent) => void
  toggleChat: () => void
  openChat: () => void
  closeChat: () => void
}

const FloatingAgentContext = createContext<FloatingAgentContextType | null>(null)

export function useFloatingAgent() {
  const ctx = useContext(FloatingAgentContext)
  if (!ctx) throw new Error('useFloatingAgent must be used within FloatingAgentProvider')
  return ctx
}

interface FloatingAgentProviderProps {
  children: ReactNode
  workspaceSlug: string
}

export function FloatingAgentProvider({ children, workspaceSlug }: FloatingAgentProviderProps) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch agents
  useEffect(() => {
    fetch(`/api/workspaces/${workspaceSlug}/agents/list`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAgents(data)
          // Restore last selected agent from localStorage
          const lastAgentId = localStorage.getItem('floating-agent-id')
          const lastAgent = data.find((a: Agent) => a.id === lastAgentId)
          setSelectedAgent(lastAgent || data[0] || null)
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [workspaceSlug])

  const selectAgent = useCallback((agent: Agent) => {
    setSelectedAgent(agent)
    localStorage.setItem('floating-agent-id', agent.id)
  }, [])

  const toggleChat = useCallback(() => setIsOpen(prev => !prev), [])
  const openChat = useCallback(() => setIsOpen(true), [])
  const closeChat = useCallback(() => setIsOpen(false), [])

  return (
    <FloatingAgentContext.Provider value={{
      agents,
      selectedAgent,
      isOpen,
      isLoading,
      selectAgent,
      toggleChat,
      openChat,
      closeChat,
    }}>
      {children}
    </FloatingAgentContext.Provider>
  )
}
