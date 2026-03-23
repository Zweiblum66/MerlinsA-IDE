<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useApi } from '@/composables/use-api.js'
import { useProjectStore } from '@/stores/project.js'

// ── Types ──────────────────────────────────────────────────────────────────

type CheckStatus = 'OK' | 'WARN' | 'FAIL'

interface HealthCheck {
  name: string
  status: CheckStatus
  detail: string
}

interface HealthReport {
  score: number
  checks: HealthCheck[]
  auditedAt: number
}

// ── Constants ──────────────────────────────────────────────────────────────

const CHECK_LABELS: Record<string, string> = {
  activeSprint: 'Active Sprint',
  tokenBudget: 'Token Budget',
  blockedTasks: 'Blocked Tasks',
  apiContracts: 'API Contracts',
  naming: 'Naming',
  goalDrift: 'Goal Drift',
  agentFailures: 'Agent Failures',
}

// ── Composables ────────────────────────────────────────────────────────────

const api = useApi()
const projectStore = useProjectStore()

// ── Reactive state ─────────────────────────────────────────────────────────

const report = ref<HealthReport | null>(null)
const isLoading = ref<boolean>(false)
const errorMessage = ref<string | null>(null)

// ── Computed ───────────────────────────────────────────────────────────────

const scoreColorClass = computed<string>(() => {
  const score = report.value?.score ?? 0
  if (score >= 75) return 'text-green-400'
  if (score >= 50) return 'text-yellow-400'
  return 'text-red-400'
})

const scoreRingClass = computed<string>(() => {
  const score = report.value?.score ?? 0
  if (score >= 75) return 'border-green-500'
  if (score >= 50) return 'border-yellow-500'
  return 'border-red-500'
})

const formattedAuditTime = computed<string>(() => {
  if (!report.value) return 'Never'
  return new Date(report.value.auditedAt * 1000).toLocaleString()
})

// ── Methods ────────────────────────────────────────────────────────────────

function checkCardClass(status: CheckStatus): string {
  if (status === 'OK') return 'border-green-900 bg-green-950/20'
  if (status === 'WARN') return 'border-yellow-800 bg-yellow-950/20'
  return 'border-red-800 bg-red-950/20'
}

function checkIconSymbol(status: CheckStatus): string {
  if (status === 'OK') return '✓'
  if (status === 'WARN') return '⚠'
  return '✗'
}

function checkIconClass(status: CheckStatus): string {
  if (status === 'OK') return 'text-green-400'
  if (status === 'WARN') return 'text-yellow-400'
  return 'text-red-400'
}

function friendlyCheckName(rawName: string): string {
  return CHECK_LABELS[rawName] ?? rawName
}

async function runAudit(): Promise<void> {
  const projectId = projectStore.activeProject?.id
  if (!projectId) {
    errorMessage.value = 'No active project selected.'
    return
  }

  isLoading.value = true
  errorMessage.value = null

  try {
    const result = await api.get<HealthReport>(`/projects/${projectId}/health`)
    report.value = result
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to fetch health report.'
  } finally {
    isLoading.value = false
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

onMounted(() => {
  void runAudit()
})
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-white">
    <!-- Page header -->
    <div class="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-white">Health Audit</h1>
        <p class="text-sm text-slate-400 mt-0.5">Project health checks and diagnostics</p>
      </div>
      <div class="flex items-center gap-4">
        <span class="text-xs text-slate-500">
          Last audited: {{ formattedAuditTime }}
        </span>
        <button
          type="button"
          class="rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 transition-colors"
          :disabled="isLoading"
          @click="runAudit"
        >
          <span v-if="isLoading">Running…</span>
          <span v-else>Run Audit</span>
        </button>
      </div>
    </div>

    <div class="px-6 py-6 space-y-6">
      <!-- Error banner -->
      <div
        v-if="errorMessage"
        class="rounded-md bg-red-900/40 border border-red-800 text-red-400 text-sm px-4 py-3"
        role="alert"
      >
        {{ errorMessage }}
      </div>

      <!-- No active project -->
      <div
        v-if="!projectStore.activeProject && !isLoading"
        class="py-16 text-center text-slate-500 text-sm"
      >
        No active project. Log in to a project first.
      </div>

      <!-- Loading state (first load) -->
      <div v-else-if="isLoading && !report" class="flex items-center justify-center py-16">
        <span class="text-slate-500 text-sm">Running audit…</span>
      </div>

      <template v-else-if="report">
        <!-- Health score gauge -->
        <div class="flex flex-col items-center py-6">
          <div
            class="w-36 h-36 rounded-full border-8 flex items-center justify-center transition-colors"
            :class="scoreRingClass"
          >
            <div class="text-center">
              <div class="text-4xl font-bold leading-none" :class="scoreColorClass">
                {{ report.score }}
              </div>
              <div class="text-xs text-slate-400 mt-1">/ 100</div>
            </div>
          </div>
          <div class="mt-3 text-sm font-medium" :class="scoreColorClass">
            <template v-if="report.score >= 75">Healthy</template>
            <template v-else-if="report.score >= 50">Needs Attention</template>
            <template v-else>Critical</template>
          </div>
        </div>

        <!-- Health checks grid -->
        <div class="grid grid-cols-2 gap-4">
          <div
            v-for="check in report.checks"
            :key="check.name"
            class="rounded-lg border p-4 flex items-start gap-3 transition-colors"
            :class="checkCardClass(check.status)"
          >
            <!-- Status icon -->
            <div
              class="text-xl leading-none font-bold shrink-0 mt-0.5"
              :class="checkIconClass(check.status)"
              aria-hidden="true"
            >
              {{ checkIconSymbol(check.status) }}
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-white mb-0.5">
                {{ friendlyCheckName(check.name) }}
              </div>
              <div class="text-xs text-slate-400 leading-relaxed">
                {{ check.detail }}
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
