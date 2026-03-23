<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project.js'
import { useSprintStore } from '@/stores/sprint.js'
import { useAgentStore } from '@/stores/agents.js'
import { useTokenStore } from '@/stores/tokens.js'
import { useContractStore } from '@/stores/contracts.js'
import { useNamingStore } from '@/stores/naming.js'
import type { Sprint } from '@/stores/sprint.js'
import type { AgentSession } from '@/stores/agents.js'

const router = useRouter()

const projectStore = useProjectStore()
const sprintStore = useSprintStore()
const agentStore = useAgentStore()
const tokenStore = useTokenStore()
const contractStore = useContractStore()
const namingStore = useNamingStore()

// ---------------------------------------------------------------------------
// Sprint helpers
// ---------------------------------------------------------------------------

const activeSprint = computed<Sprint | null>(() => sprintStore.activeSprint)

const sprintStatusColor = computed<string>(() => {
  const status = activeSprint.value?.status
  if (status === 'ACTIVE') return 'bg-green-900/50 text-green-400 border-green-800'
  if (status === 'PLANNING') return 'bg-blue-900/50 text-blue-400 border-blue-800'
  if (status === 'COMPLETED') return 'bg-slate-700 text-slate-400 border-slate-600'
  if (status === 'CANCELLED') return 'bg-red-900/50 text-red-400 border-red-800'
  return 'bg-slate-700 text-slate-400 border-slate-600'
})

const sprintProgress = computed(() => sprintStore.sprintProgress)

const progressBarDoneWidth = computed<string>(() => {
  const p = sprintProgress.value
  if (!p || p.total === 0) return '0%'
  return `${Math.round((p.done / p.total) * 100)}%`
})

const progressBarInProgressWidth = computed<string>(() => {
  const p = sprintProgress.value
  if (!p || p.total === 0) return '0%'
  return `${Math.round((p.inProgress / p.total) * 100)}%`
})

const progressBarBlockedWidth = computed<string>(() => {
  const p = sprintProgress.value
  if (!p || p.total === 0) return '0%'
  return `${Math.round((p.blocked / p.total) * 100)}%`
})

// ---------------------------------------------------------------------------
// Token budget helpers
// ---------------------------------------------------------------------------

const budgetInfo = computed(() => tokenStore.budgetInfo)

const budgetPercent = computed<number>(() => budgetInfo.value?.percentUsed ?? 0)

const budgetRingColor = computed<string>(() => {
  const pct = budgetPercent.value
  if (pct >= 90) return 'text-red-500'
  if (pct >= 70) return 'text-yellow-500'
  return 'text-green-500'
})

const budgetRingStroke = computed<string>(() => {
  const pct = budgetPercent.value
  if (pct >= 90) return '#ef4444'
  if (pct >= 70) return '#eab308'
  return '#22c55e'
})

// SVG ring: circumference = 2 * pi * r = 2 * pi * 36 ≈ 226.2
const RING_CIRCUMFERENCE = 226.2

const ringDashoffset = computed<number>(() => {
  const filled = (budgetPercent.value / 100) * RING_CIRCUMFERENCE
  return RING_CIRCUMFERENCE - filled
})

// ---------------------------------------------------------------------------
// Active agents
// ---------------------------------------------------------------------------

const activeSessions = computed<AgentSession[]>(() =>
  agentStore.agentSessions.filter((s) => s.status === 'RUNNING'),
)

function formatElapsed(startedAt: number): string {
  const elapsedMs = Date.now() - startedAt * 1000
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

// ---------------------------------------------------------------------------
// Guardrails helpers
// ---------------------------------------------------------------------------

const driftContractsCount = computed<number>(
  () => contractStore.contracts.filter((c) => c.hasBreakingChanges).length,
)

const totalContractsCount = computed<number>(() => contractStore.contracts.length)

const namingViolationsCount = computed<number>(
  () => namingStore.summary?.totalViolations ?? namingStore.violations.length,
)

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------

async function handleStartSprint(): Promise<void> {
  const sprint = activeSprint.value
  if (!sprint) return
  if (sprint.status === 'PLANNING') {
    await sprintStore.startSprint(sprint.id)
    const projectId = projectStore.activeProject?.id
    if (projectId) {
      await sprintStore.fetchProgress(sprint.id)
    }
  }
}

async function handleRunAudit(): Promise<void> {
  await router.push({ name: 'audit' })
}

async function handleOpenWizard(): Promise<void> {
  await router.push({ name: 'wizard' })
}

// ---------------------------------------------------------------------------
// Mount: load all data
// ---------------------------------------------------------------------------

onMounted(async () => {
  const projectId = projectStore.activeProject?.id

  const fetches: Promise<void>[] = [
    agentStore.fetchAgentSessions(projectId),
    agentStore.fetchDefinitions(),
    contractStore.fetchContracts(),
    namingStore.fetchSummary(projectId),
  ]

  if (projectId) {
    fetches.push(sprintStore.fetchSprints(projectId))
    fetches.push(tokenStore.fetchBudget(projectId))
  }

  await Promise.allSettled(fetches)

  if (sprintStore.activeSprint) {
    await sprintStore.fetchProgress(sprintStore.activeSprint.id)
  }
})
</script>

<template>
  <div class="grid grid-cols-3 gap-5 auto-rows-min">

    <!-- Sprint Status Card (col-span-2) -->
    <div class="col-span-2 bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-white font-semibold text-base">Sprint Status</h2>
        <span
          v-if="activeSprint"
          class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
          :class="sprintStatusColor"
        >
          {{ activeSprint.status }}
        </span>
      </div>

      <div v-if="activeSprint">
        <p class="text-sm text-slate-400 mb-1">
          Sprint <span class="text-white font-semibold">#{{ activeSprint.number }}</span>
        </p>
        <p class="text-sm text-slate-300 mb-5">{{ activeSprint.goal }}</p>

        <!-- Progress bar -->
        <div v-if="sprintProgress" class="space-y-2">
          <div class="flex justify-between text-xs text-slate-400 mb-1">
            <span>Progress</span>
            <span>{{ sprintProgress.percentComplete }}% complete</span>
          </div>

          <div class="h-2.5 w-full rounded-full bg-slate-700 overflow-hidden flex">
            <div
              class="h-full bg-green-500 transition-all duration-500"
              :style="{ width: progressBarDoneWidth }"
            />
            <div
              class="h-full bg-blue-500 transition-all duration-500"
              :style="{ width: progressBarInProgressWidth }"
            />
            <div
              class="h-full bg-red-500 transition-all duration-500"
              :style="{ width: progressBarBlockedWidth }"
            />
          </div>

          <div class="flex gap-4 text-xs text-slate-400 mt-2">
            <span class="flex items-center gap-1.5">
              <span class="inline-block w-2 h-2 rounded-sm bg-green-500" />
              Done ({{ sprintProgress.done }})
            </span>
            <span class="flex items-center gap-1.5">
              <span class="inline-block w-2 h-2 rounded-sm bg-blue-500" />
              In Progress ({{ sprintProgress.inProgress }})
            </span>
            <span class="flex items-center gap-1.5">
              <span class="inline-block w-2 h-2 rounded-sm bg-red-500" />
              Blocked ({{ sprintProgress.blocked }})
            </span>
            <span class="flex items-center gap-1.5">
              <span class="inline-block w-2 h-2 rounded-sm bg-slate-500" />
              Todo ({{ sprintProgress.todo }})
            </span>
          </div>
        </div>

        <p v-else class="text-sm text-slate-500 mt-2">Loading progress...</p>
      </div>

      <p v-else class="text-sm text-slate-500">No active sprint found.</p>
    </div>

    <!-- Token Budget Card -->
    <div class="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700 flex flex-col items-center justify-center">
      <h2 class="text-white font-semibold text-base mb-4 self-start">Token Budget</h2>

      <div v-if="budgetInfo" class="flex flex-col items-center gap-3">
        <!-- Ring gauge -->
        <div class="relative w-28 h-28">
          <svg class="w-full h-full -rotate-90" viewBox="0 0 80 80">
            <!-- Track -->
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="#334155"
              stroke-width="7"
            />
            <!-- Progress arc -->
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              :stroke="budgetRingStroke"
              stroke-width="7"
              stroke-linecap="round"
              :stroke-dasharray="RING_CIRCUMFERENCE"
              :stroke-dashoffset="ringDashoffset"
              class="transition-all duration-700"
            />
          </svg>
          <!-- Center label -->
          <div class="absolute inset-0 flex items-center justify-center">
            <span class="text-lg font-bold" :class="budgetRingColor">
              {{ budgetPercent }}%
            </span>
          </div>
        </div>

        <div class="text-center">
          <p class="text-xs text-slate-400">
            ${{ budgetInfo.spentUsd.toFixed(2) }} of ${{ budgetInfo.budgetUsd.toFixed(2) }}
          </p>
          <p class="text-xs text-slate-500 mt-0.5">
            ${{ budgetInfo.remainingUsd.toFixed(2) }} remaining
          </p>
        </div>

        <span
          v-if="budgetInfo.willExceed"
          class="text-xs px-2 py-0.5 rounded-full bg-red-900/50 text-red-400 border border-red-800 font-medium"
        >
          Budget at risk
        </span>
      </div>

      <p v-else class="text-sm text-slate-500">No budget data available.</p>
    </div>

    <!-- Active Agents Card -->
    <div class="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-white font-semibold text-base">Active Agents</h2>
        <span class="text-xs text-slate-500">{{ activeSessions.length }} running</span>
      </div>

      <div v-if="activeSessions.length > 0" class="space-y-3">
        <div
          v-for="session in activeSessions"
          :key="session.id"
          class="flex flex-col gap-1.5 p-3 rounded-md bg-slate-900 border border-slate-700"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-slate-200">{{ session.agentName }}</span>
            <span
              v-if="session.hasDrift"
              class="text-xs px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400 border border-yellow-800"
            >
              drift
            </span>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">
              {{ session.model }}
            </span>
            <span class="text-xs text-slate-500">
              {{ formatElapsed(session.startedAt) }}
            </span>
          </div>
        </div>
      </div>

      <p v-else class="text-sm text-slate-500">No agents currently running.</p>
    </div>

    <!-- Guardrails Card -->
    <div class="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
      <h2 class="text-white font-semibold text-base mb-4">Guardrails</h2>

      <div class="space-y-4">
        <!-- API Contracts -->
        <div class="flex items-start gap-3 p-3 rounded-md bg-slate-900 border border-slate-700">
          <span class="text-xl mt-0.5">◇</span>
          <div>
            <p class="text-sm font-medium text-slate-200">API Contracts</p>
            <p class="text-xs text-slate-400 mt-0.5">
              {{ totalContractsCount }} registered
            </p>
            <p
              v-if="driftContractsCount > 0"
              class="text-xs text-yellow-400 mt-0.5"
            >
              {{ driftContractsCount }} with breaking changes
            </p>
            <p v-else class="text-xs text-green-400 mt-0.5">No drift detected</p>
          </div>
        </div>

        <!-- Naming conventions -->
        <div class="flex items-start gap-3 p-3 rounded-md bg-slate-900 border border-slate-700">
          <span class="text-xl mt-0.5">◻</span>
          <div>
            <p class="text-sm font-medium text-slate-200">Naming Conventions</p>
            <p
              v-if="namingViolationsCount > 0"
              class="text-xs text-red-400 mt-0.5"
            >
              {{ namingViolationsCount }} violations
            </p>
            <p v-else class="text-xs text-green-400 mt-0.5">All clear</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions Card -->
    <div class="bg-slate-800 rounded-lg shadow-lg p-6 border border-slate-700">
      <h2 class="text-white font-semibold text-base mb-4">Quick Actions</h2>

      <div class="flex flex-col gap-3">
        <button
          class="w-full flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800"
          :class="
            activeSprint?.status === 'PLANNING'
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
          "
          :disabled="activeSprint?.status !== 'PLANNING' || sprintStore.isLoading"
          @click="handleStartSprint"
        >
          <span>&#9654;</span>
          Start Sprint
        </button>

        <button
          class="w-full flex items-center gap-2 px-4 py-2.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-800"
          @click="handleRunAudit"
        >
          <span>◆</span>
          Run Audit
        </button>

        <button
          class="w-full flex items-center gap-2 px-4 py-2.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-800"
          @click="handleOpenWizard"
        >
          <span>✦</span>
          Open Wizard
        </button>
      </div>
    </div>

  </div>
</template>
