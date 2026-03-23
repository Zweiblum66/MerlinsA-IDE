import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '../composables/use-api.js'

export interface TokensByModel {
  model: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export interface TokensByAgent {
  agentName: string
  totalTokens: number
  costUsd: number
}

export interface BudgetInfo {
  projectId: string
  budgetUsd: number
  spentUsd: number
  remainingUsd: number
  percentUsed: number
  willExceed: boolean
}

export interface TokenTimelinePoint {
  date: string
  tokens: number
  costUsd: number
}

/**
 * Token analytics store. Manages token usage breakdown and budget information.
 */
export const useTokenStore = defineStore('tokens', () => {
  const tokensByModel = ref<TokensByModel[]>([])
  const tokensByAgent = ref<TokensByAgent[]>([])
  const budgetInfo = ref<BudgetInfo | null>(null)
  const timeline = ref<TokenTimelinePoint[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const api = useApi()

  async function fetchTokenUsage(projectId: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const [byModel, byAgent, timelineData] = await Promise.all([
        api.get<TokensByModel[]>(`/tokens/by-model?projectId=${encodeURIComponent(projectId)}`),
        api.get<TokensByAgent[]>(`/tokens/by-agent?projectId=${encodeURIComponent(projectId)}`),
        api.get<TokenTimelinePoint[]>(
          `/tokens/timeline?projectId=${encodeURIComponent(projectId)}`
        ),
      ])
      tokensByModel.value = byModel
      tokensByAgent.value = byAgent
      timeline.value = timelineData
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch token usage'
    } finally {
      isLoading.value = false
    }
  }

  async function fetchBudget(projectId: string): Promise<void> {
    try {
      const result = await api.get<BudgetInfo>(
        `/tokens/budget?projectId=${encodeURIComponent(projectId)}`
      )
      budgetInfo.value = result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch budget'
    }
  }

  return {
    tokensByModel,
    tokensByAgent,
    budgetInfo,
    timeline,
    isLoading,
    error,
    fetchTokenUsage,
    fetchBudget,
  }
})
