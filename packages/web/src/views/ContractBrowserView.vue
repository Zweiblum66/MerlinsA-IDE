<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useContractStore } from '@/stores/contracts.js'
import type { ApiContract, ContractChange } from '@/stores/contracts.js'

const contractStore = useContractStore()

const searchQuery = ref<string>('')

const filteredContracts = computed<ApiContract[]>(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return contractStore.contracts
  return contractStore.contracts.filter(
    (c) =>
      c.path.toLowerCase().includes(query) ||
      c.method.toLowerCase().includes(query) ||
      c.version.toLowerCase().includes(query),
  )
})

function selectContract(contract: ApiContract): void {
  contractStore.selectContract(contract)
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString()
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const METHOD_BADGE_CLASSES: Record<ApiContract['method'], string> = {
  GET: 'bg-green-700 text-green-100',
  POST: 'bg-blue-700 text-blue-100',
  PUT: 'bg-yellow-700 text-yellow-100',
  DELETE: 'bg-red-700 text-red-100',
  PATCH: 'bg-purple-700 text-purple-100',
}

function methodBadgeClass(method: ApiContract['method']): string {
  return METHOD_BADGE_CLASSES[method] ?? 'bg-slate-700 text-slate-100'
}

function changeRowClass(change: ContractChange): string {
  return change.isBreaking
    ? 'border-l-2 border-red-500 bg-red-950/30'
    : 'border-l-2 border-yellow-600 bg-yellow-950/20'
}

function changeTypeBadgeClass(change: ContractChange): string {
  if (change.changeType === 'REMOVED') return 'bg-red-800 text-red-100'
  if (change.changeType === 'ADDED') return 'bg-green-800 text-green-100'
  return 'bg-slate-700 text-slate-100'
}

onMounted(() => {
  void contractStore.fetchContracts()
})
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-white flex flex-col">
    <!-- Page header -->
    <div class="px-6 py-5 border-b border-slate-800">
      <h1 class="text-xl font-semibold text-white">API Contract Browser</h1>
      <p class="text-sm text-slate-400 mt-0.5">Browse registered API contracts and change history</p>
    </div>

    <!-- Error banner -->
    <div
      v-if="contractStore.error"
      class="mx-6 mt-4 rounded-md bg-red-900/40 border border-red-800 text-red-400 text-sm px-4 py-3"
      role="alert"
    >
      {{ contractStore.error }}
    </div>

    <!-- Two-panel layout -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Left panel: contract list -->
      <aside class="w-1/3 border-r border-slate-800 flex flex-col">
        <!-- Search -->
        <div class="px-4 py-3 border-b border-slate-800">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search by path, method, version…"
            class="w-full rounded-md bg-slate-900 border border-slate-700 text-white placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <!-- Loading state -->
        <div v-if="contractStore.isLoading" class="flex-1 flex items-center justify-center">
          <span class="text-slate-500 text-sm">Loading contracts…</span>
        </div>

        <!-- Contract list -->
        <ul v-else class="flex-1 overflow-y-auto divide-y divide-slate-800">
          <li
            v-for="contract in filteredContracts"
            :key="contract.id"
            class="px-4 py-3 cursor-pointer hover:bg-slate-800 transition-colors"
            :class="{
              'bg-slate-800': contractStore.selectedContract?.id === contract.id,
            }"
            @click="selectContract(contract)"
          >
            <div class="flex items-center gap-2 mb-1">
              <span
                class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold uppercase"
                :class="methodBadgeClass(contract.method)"
              >
                {{ contract.method }}
              </span>
              <!-- Breaking change indicator -->
              <span
                v-if="contract.hasBreakingChanges"
                class="inline-flex items-center rounded-full bg-red-600 text-white text-xs px-1.5 py-0.5 font-medium"
                :title="`${contract.breakingChangesCount} breaking change(s)`"
              >
                {{ contract.breakingChangesCount }} breaking
              </span>
            </div>
            <div class="text-sm text-white font-mono truncate">{{ contract.path }}</div>
            <div class="text-xs text-slate-500 mt-0.5">v{{ contract.version }}</div>
          </li>

          <li v-if="filteredContracts.length === 0" class="px-4 py-8 text-center text-slate-500 text-sm">
            No contracts match your search.
          </li>
        </ul>
      </aside>

      <!-- Right panel: contract detail -->
      <main class="w-2/3 overflow-y-auto">
        <!-- Empty state -->
        <div
          v-if="!contractStore.selectedContract"
          class="h-full flex items-center justify-center"
        >
          <div class="text-center">
            <div class="text-4xl mb-3 text-slate-700">&#9776;</div>
            <p class="text-slate-500 text-sm">Select a contract to view details</p>
          </div>
        </div>

        <!-- Detail view -->
        <div v-else class="px-6 py-5 space-y-6">
          <!-- Header info -->
          <div class="flex items-start gap-4">
            <span
              class="inline-flex items-center rounded px-2 py-1 text-sm font-bold uppercase mt-0.5"
              :class="methodBadgeClass(contractStore.selectedContract.method)"
            >
              {{ contractStore.selectedContract.method }}
            </span>
            <div class="flex-1 min-w-0">
              <div class="text-lg font-mono text-white break-all">
                {{ contractStore.selectedContract.path }}
              </div>
              <div class="text-sm text-slate-400 mt-0.5">
                Version {{ contractStore.selectedContract.version }} &mdash;
                registered {{ formatTimestamp(contractStore.selectedContract.registeredAt) }}
              </div>
            </div>
            <span
              v-if="contractStore.selectedContract.hasBreakingChanges"
              class="shrink-0 inline-flex items-center rounded-full bg-red-600 text-white text-xs px-2.5 py-1 font-medium"
            >
              {{ contractStore.selectedContract.breakingChangesCount }} breaking
            </span>
          </div>

          <!-- Request schema -->
          <section>
            <h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2">
              Request Schema
            </h2>
            <pre
              class="bg-slate-900 border border-slate-700 rounded-md text-xs text-green-300 p-4 overflow-x-auto leading-relaxed"
            ><code>{{ formatJson(contractStore.selectedContract.requestSchema) }}</code></pre>
          </section>

          <!-- Response schema -->
          <section>
            <h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2">
              Response Schema
            </h2>
            <pre
              class="bg-slate-900 border border-slate-700 rounded-md text-xs text-blue-300 p-4 overflow-x-auto leading-relaxed"
            ><code>{{ formatJson(contractStore.selectedContract.responseSchema) }}</code></pre>
          </section>

          <!-- Change history -->
          <section>
            <h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-3">
              Change History
            </h2>

            <div v-if="contractStore.changes.length === 0" class="text-slate-500 text-sm">
              No changes recorded.
            </div>

            <ul v-else class="space-y-2">
              <li
                v-for="change in contractStore.changes"
                :key="change.id"
                class="rounded-md px-4 py-3"
                :class="changeRowClass(change)"
              >
                <div class="flex items-center gap-2 mb-1">
                  <span
                    class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold uppercase"
                    :class="changeTypeBadgeClass(change)"
                  >
                    {{ change.changeType }}
                  </span>
                  <span
                    v-if="change.isBreaking"
                    class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold bg-red-700 text-red-100"
                  >
                    BREAKING
                  </span>
                  <span class="text-xs text-slate-400 ml-auto">
                    {{ formatTimestamp(change.detectedAt) }}
                  </span>
                </div>
                <p class="text-sm text-slate-200">{{ change.description }}</p>
              </li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>
