import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '../composables/use-api.js'

export interface ApiContract {
  id: string
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  path: string
  version: string
  requestSchema: unknown
  responseSchema: unknown
  registeredAt: number
  hasBreakingChanges: boolean
  breakingChangesCount: number
}

export interface ContractChange {
  id: string
  contractId: string
  changeType: 'ADDED' | 'MODIFIED' | 'REMOVED'
  isBreaking: boolean
  description: string
  oldValue: unknown
  newValue: unknown
  detectedAt: number
}

/**
 * API contract store. Manages the list of registered API contracts and their change history.
 */
export const useContractStore = defineStore('contracts', () => {
  const contracts = ref<ApiContract[]>([])
  const selectedContract = ref<ApiContract | null>(null)
  const changes = ref<ContractChange[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const api = useApi()

  async function fetchContracts(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const result = await api.get<ApiContract[]>('/contracts')
      contracts.value = result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch contracts'
    } finally {
      isLoading.value = false
    }
  }

  async function fetchContractChanges(contractId: string): Promise<void> {
    try {
      const result = await api.get<ContractChange[]>(`/contracts/${contractId}/changes`)
      changes.value = result
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch contract changes'
    }
  }

  function selectContract(contract: ApiContract | null): void {
    selectedContract.value = contract
    if (contract) {
      void fetchContractChanges(contract.id)
    } else {
      changes.value = []
    }
  }

  return {
    contracts,
    selectedContract,
    changes,
    isLoading,
    error,
    fetchContracts,
    fetchContractChanges,
    selectContract,
  }
})
