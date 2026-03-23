import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '../composables/use-api.js'

export interface AgentSession {
  id: string
  agentName: string
  model: string
  status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  tokensUsed: number
  costUsd: number
  hasDrift: boolean
  startedAt: number
  completedAt: number | null
  taskId: string | null
  projectId: string
}

export interface AgentDefinition {
  name: string
  model: string
  description: string
  tools: string[]
}

export interface RecentActivity {
  id: string
  agentName: string
  event: string
  timestamp: number
  detail: string | null
}

/**
 * Agent store. Manages active agent sessions and agent definitions.
 */
export const useAgentStore = defineStore('agents', () => {
  const agentSessions = ref<AgentSession[]>([])
  const agentDefinitions = ref<AgentDefinition[]>([])
  const recentActivity = ref<RecentActivity[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const api = useApi()

  async function fetchAgentSessions(projectId?: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const url = projectId
        ? `/agents/sessions?projectId=${encodeURIComponent(projectId)}`
        : '/agents/sessions'
      const result = await api.get<AgentSession[]>(url)
      agentSessions.value = result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch agent sessions'
    } finally {
      isLoading.value = false
    }
  }

  async function fetchDefinitions(): Promise<void> {
    try {
      const result = await api.get<AgentDefinition[]>('/agents/definitions')
      agentDefinitions.value = result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch agent definitions'
    }
  }

  async function fetchRecentActivity(limit = 10): Promise<void> {
    try {
      const result = await api.get<RecentActivity[]>(`/agents/activity?limit=${limit}`)
      recentActivity.value = result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch recent activity'
    }
  }

  function updateSessionFromEvent(session: Partial<AgentSession> & { id: string }): void {
    const index = agentSessions.value.findIndex((s) => s.id === session.id)
    if (index !== -1) {
      agentSessions.value[index] = { ...agentSessions.value[index]!, ...session }
    } else {
      agentSessions.value.unshift(session as AgentSession)
    }
  }

  function addActivity(activity: RecentActivity): void {
    recentActivity.value.unshift(activity)
    if (recentActivity.value.length > 20) {
      recentActivity.value = recentActivity.value.slice(0, 20)
    }
  }

  return {
    agentSessions,
    agentDefinitions,
    recentActivity,
    isLoading,
    error,
    fetchAgentSessions,
    fetchDefinitions,
    fetchRecentActivity,
    updateSessionFromEvent,
    addActivity,
  }
})
