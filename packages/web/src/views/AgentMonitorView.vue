<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useAgentStore } from '@/stores/agents.js'
import type { AgentSession, AgentDefinition, RecentActivity } from '@/stores/agents.js'

const agentStore = useAgentStore()

// ── Filter ────────────────────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'ACTIVE' | 'COMPLETED' | 'FAILED'

const activeFilter = ref<StatusFilter>('ALL')

const FILTER_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'FAILED', label: 'Failed' },
]

// ── Sorting ───────────────────────────────────────────────────────────────────

type SortKey = keyof Pick<AgentSession, 'agentName' | 'status' | 'model' | 'costUsd' | 'startedAt'>
type SortDir = 'asc' | 'desc'

const sortKey = ref<SortKey>('startedAt')
const sortDir = ref<SortDir>('desc')

function toggleSort(key: SortKey): void {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
}

function sortIndicator(key: SortKey): string {
  if (sortKey.value !== key) return ''
  return sortDir.value === 'asc' ? ' ▲' : ' ▼'
}

// ── Filtered + sorted sessions ────────────────────────────────────────────────

const filteredSessions = computed<AgentSession[]>(() => {
  let sessions = agentStore.agentSessions

  if (activeFilter.value !== 'ALL') {
    const statusMap: Record<StatusFilter, AgentSession['status'][]> = {
      ALL: [],
      ACTIVE: ['RUNNING', 'IDLE'],
      COMPLETED: ['COMPLETED'],
      FAILED: ['FAILED'],
    }
    const allowed = statusMap[activeFilter.value]
    sessions = sessions.filter((s) => allowed.includes(s.status))
  }

  return [...sessions].sort((a, b) => {
    const key = sortKey.value
    const aVal = a[key]
    const bVal = b[key]
    let cmp = 0
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      cmp = aVal.localeCompare(bVal)
    } else if (typeof aVal === 'number' && typeof bVal === 'number') {
      cmp = aVal - bVal
    }
    return sortDir.value === 'asc' ? cmp : -cmp
  })
})

// ── Status badge ──────────────────────────────────────────────────────────────

function statusBadgeClass(status: AgentSession['status']): string {
  switch (status) {
    case 'RUNNING':
      return 'bg-green-900/50 text-green-400 border border-green-700'
    case 'IDLE':
      return 'bg-green-900/30 text-green-500 border border-green-800'
    case 'COMPLETED':
      return 'bg-blue-900/50 text-blue-400 border border-blue-700'
    case 'FAILED':
      return 'bg-red-900/50 text-red-400 border border-red-700'
    default:
      return 'bg-yellow-900/50 text-yellow-400 border border-yellow-700'
  }
}

function statusLabel(status: AgentSession['status']): string {
  switch (status) {
    case 'RUNNING':
      return 'ACTIVE'
    case 'IDLE':
      return 'PAUSED'
    default:
      return status
  }
}

// ── Duration ──────────────────────────────────────────────────────────────────

function formatDuration(session: AgentSession): string {
  const endMs = session.completedAt ?? Date.now() / 1000
  const seconds = Math.max(0, Math.round(endMs - session.startedAt))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}m ${remaining}s`
}

// ── Drift score ───────────────────────────────────────────────────────────────

/**
 * Returns the drift score for a session. Sessions with hasDrift flag are
 * assigned a score >= 3 to trigger the warning indicator.
 */
function driftScore(session: AgentSession): number {
  return session.hasDrift ? 3 : 0
}

const hasDriftWarning = (session: AgentSession): boolean => session.hasDrift

// ── Agent definitions ─────────────────────────────────────────────────────────

const KNOWN_AGENTS = [
  'product-owner',
  'scrum-master',
  'architect',
  'developer',
  'qa-engineer',
  'devops-engineer',
  'api-guardian',
]

const agentDefinitions = computed<AgentDefinition[]>(() => {
  if (agentStore.agentDefinitions.length > 0) return agentStore.agentDefinitions
  // Fallback skeleton while loading
  return KNOWN_AGENTS.map((name) => ({
    name,
    model: '—',
    description: 'Loading...',
    tools: [],
  }))
})

function modelBadgeClass(model: string): string {
  if (model.includes('opus')) return 'bg-purple-800 text-purple-200'
  if (model.includes('sonnet')) return 'bg-blue-800 text-blue-200'
  if (model.includes('haiku')) return 'bg-teal-800 text-teal-200'
  return 'bg-slate-700 text-slate-300'
}

// ── Activity feed ─────────────────────────────────────────────────────────────

const activityFeedRef = ref<HTMLElement | null>(null)

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

watch(
  () => agentStore.recentActivity.length,
  async () => {
    await nextTick()
    if (activityFeedRef.value) {
      activityFeedRef.value.scrollTop = activityFeedRef.value.scrollHeight
    }
  },
)

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  void agentStore.fetchAgentSessions()
  void agentStore.fetchDefinitions()
  void agentStore.fetchRecentActivity(20)
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header + filter buttons -->
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-slate-100">Agent Team</h2>
      <div class="flex items-center gap-2">
        <button
          v-for="filter in FILTER_OPTIONS"
          :key="filter.key"
          class="text-xs px-3 py-1.5 rounded-md border transition-colors"
          :class="
            activeFilter === filter.key
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
          "
          @click="activeFilter = filter.key"
        >
          {{ filter.label }}
        </button>
      </div>
    </div>

    <!-- Sessions table -->
    <div class="bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-700 text-left">
              <th
                class="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-200 select-none"
                @click="toggleSort('agentName')"
              >
                Agent Name{{ sortIndicator('agentName') }}
              </th>
              <th
                class="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-200 select-none"
                @click="toggleSort('status')"
              >
                Status{{ sortIndicator('status') }}
              </th>
              <th
                class="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-200 select-none"
                @click="toggleSort('model')"
              >
                Model{{ sortIndicator('model') }}
              </th>
              <th
                class="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-200 select-none"
                @click="toggleSort('costUsd')"
              >
                Cost{{ sortIndicator('costUsd') }}
              </th>
              <th class="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide">
                Drift Score
              </th>
              <th
                class="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-200 select-none"
                @click="toggleSort('startedAt')"
              >
                Duration{{ sortIndicator('startedAt') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-if="agentStore.isLoading"
              class="border-b border-slate-700/50"
            >
              <td colspan="6" class="px-4 py-8 text-center text-slate-500 text-sm">
                Loading sessions...
              </td>
            </tr>
            <tr
              v-else-if="filteredSessions.length === 0"
              class="border-b border-slate-700/50"
            >
              <td colspan="6" class="px-4 py-8 text-center text-slate-500 text-sm">
                No sessions match the current filter
              </td>
            </tr>
            <tr
              v-for="session in filteredSessions"
              :key="session.id"
              class="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
            >
              <td class="px-4 py-3 text-slate-200 font-medium">
                {{ session.agentName }}
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                  :class="statusBadgeClass(session.status)"
                >
                  {{ statusLabel(session.status) }}
                </span>
              </td>
              <td class="px-4 py-3 text-slate-400 font-mono text-xs">
                {{ session.model }}
              </td>
              <td class="px-4 py-3 text-slate-300 font-mono text-xs">
                ${{ session.costUsd.toFixed(4) }}
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span class="text-slate-300 font-mono text-xs">
                    {{ driftScore(session) }}
                  </span>
                  <span
                    v-if="hasDriftWarning(session)"
                    class="text-red-400 text-base leading-none"
                    title="Drift detected"
                  >
                    ⚠
                  </span>
                </div>
              </td>
              <td class="px-4 py-3 text-slate-400 font-mono text-xs">
                {{ formatDuration(session) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Agent definitions panel -->
    <div>
      <h3 class="text-sm font-semibold text-slate-300 mb-3">Agent Definitions</h3>
      <div class="grid grid-cols-3 gap-4">
        <div
          v-for="def in agentDefinitions"
          :key="def.name"
          class="bg-slate-800 rounded-lg p-4 border border-slate-700 space-y-3"
        >
          <!-- Name + model badge -->
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-semibold text-slate-200">{{ def.name }}</span>
            <span
              class="text-xs px-2 py-0.5 rounded font-mono"
              :class="modelBadgeClass(def.model)"
            >
              {{ def.model }}
            </span>
          </div>

          <!-- Description -->
          <p class="text-xs text-slate-400 leading-relaxed">
            {{ def.description }}
          </p>

          <!-- Tools list -->
          <div v-if="def.tools.length > 0">
            <p class="text-xs text-slate-500 mb-1.5 uppercase tracking-wide">Tools</p>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="tool in def.tools"
                :key="tool"
                class="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded"
              >
                {{ tool }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Activity feed -->
    <div>
      <h3 class="text-sm font-semibold text-slate-300 mb-3">Recent Activity</h3>
      <div
        ref="activityFeedRef"
        class="bg-slate-900 rounded-lg border border-slate-700 h-64 overflow-y-auto p-3 space-y-1.5"
      >
        <div
          v-if="agentStore.recentActivity.length === 0"
          class="flex items-center justify-center h-full"
        >
          <span class="text-slate-600 text-sm">No recent activity</span>
        </div>

        <div
          v-for="activity in [...agentStore.recentActivity].reverse()"
          :key="activity.id"
          class="flex items-start gap-3 text-xs py-1.5 border-b border-slate-800 last:border-0"
        >
          <span class="text-slate-600 font-mono whitespace-nowrap shrink-0">
            {{ formatTimestamp(activity.timestamp) }}
          </span>
          <span class="text-blue-400 font-medium shrink-0">
            {{ activity.agentName }}
          </span>
          <span class="text-slate-500 shrink-0">{{ activity.event }}</span>
          <span v-if="activity.detail" class="text-slate-400 truncate">
            {{ activity.detail }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
