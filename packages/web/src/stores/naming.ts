import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '../composables/use-api.js'

export interface NamingViolation {
  id: string
  filePath: string
  line: number
  identifier: string
  expectedFormat: string
  suggestion: string
  severity: 'ERROR' | 'WARNING'
  detectedAt: number
}

export interface NamingSummary {
  totalViolations: number
  errorCount: number
  warningCount: number
  filesAffected: number
  lastCheckedAt: number
}

/**
 * Naming convention store. Manages violations and summary from the naming enforcement MCP.
 */
export const useNamingStore = defineStore('naming', () => {
  const violations = ref<NamingViolation[]>([])
  const summary = ref<NamingSummary | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const api = useApi()

  async function fetchViolations(projectId?: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const url = projectId
        ? `/naming/violations?projectId=${encodeURIComponent(projectId)}`
        : '/naming/violations'
      const result = await api.get<NamingViolation[]>(url)
      violations.value = result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch naming violations'
    } finally {
      isLoading.value = false
    }
  }

  async function fetchSummary(projectId?: string): Promise<void> {
    try {
      const url = projectId
        ? `/naming/summary?projectId=${encodeURIComponent(projectId)}`
        : '/naming/summary'
      const result = await api.get<NamingSummary>(url)
      summary.value = result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch naming summary'
    }
  }

  /** Returns violations grouped by file path */
  function getViolationsByFile(): Map<string, NamingViolation[]> {
    const map = new Map<string, NamingViolation[]>()
    for (const violation of violations.value) {
      const existing = map.get(violation.filePath) ?? []
      existing.push(violation)
      map.set(violation.filePath, existing)
    }
    return map
  }

  return {
    violations,
    summary,
    isLoading,
    error,
    fetchViolations,
    fetchSummary,
    getViolationsByFile,
  }
})
