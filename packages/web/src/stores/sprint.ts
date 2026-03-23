import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '../composables/use-api.js'

export interface Sprint {
  id: string
  projectId: string
  number: number
  goal: string
  status: 'PLANNING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  startDate: number | null
  endDate: number | null
  createdAt: number
}

export interface SprintProgress {
  total: number
  done: number
  inProgress: number
  blocked: number
  todo: number
  percentComplete: number
}

export interface BurndownPoint {
  date: string
  ideal: number
  actual: number
}

export interface CreateSprintPayload {
  projectId: string
  goal: string
  endDate: number
}

/**
 * Sprint store. Manages the active sprint, progress data, and burndown chart data.
 */
export const useSprintStore = defineStore('sprint', () => {
  const sprints = ref<Sprint[]>([])
  const activeSprint = ref<Sprint | null>(null)
  const sprintProgress = ref<SprintProgress | null>(null)
  const burndownData = ref<BurndownPoint[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const api = useApi()

  async function fetchSprints(projectId: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const result = await api.get<Sprint[]>(`/projects/${projectId}/sprints`)
      sprints.value = result
      const active = result.find((s) => s.status === 'ACTIVE')
      activeSprint.value = active ?? result[result.length - 1] ?? null
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch sprints'
    } finally {
      isLoading.value = false
    }
  }

  async function fetchProgress(sprintId: string): Promise<void> {
    try {
      const result = await api.get<SprintProgress>(`/sprints/${sprintId}/progress`)
      sprintProgress.value = result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch sprint progress'
    }
  }

  async function fetchBurndown(sprintId: string): Promise<void> {
    try {
      const result = await api.get<BurndownPoint[]>(`/sprints/${sprintId}/burndown`)
      burndownData.value = result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch burndown data'
    }
  }

  async function startSprint(sprintId: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const updated = await api.patch<Sprint>(`/sprints/${sprintId}/start`)
      const index = sprints.value.findIndex((s) => s.id === sprintId)
      if (index !== -1) {
        sprints.value[index] = updated
      }
      activeSprint.value = updated
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to start sprint'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function createSprint(payload: CreateSprintPayload): Promise<Sprint> {
    isLoading.value = true
    error.value = null
    try {
      const created = await api.post<Sprint>('/sprints', payload)
      sprints.value.push(created)
      return created
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create sprint'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    sprints,
    activeSprint,
    sprintProgress,
    burndownData,
    isLoading,
    error,
    fetchSprints,
    fetchProgress,
    fetchBurndown,
    startSprint,
    createSprint,
  }
})
