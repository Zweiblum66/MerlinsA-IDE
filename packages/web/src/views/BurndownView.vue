<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { useSprintStore } from '@/stores/sprint.js'
import { useProjectStore } from '@/stores/project.js'
import type { ChartData, ChartOptions } from 'chart.js'

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Title, Tooltip, Legend, Filler)

const sprintStore = useSprintStore()
const projectStore = useProjectStore()

const selectedSprintId = ref<string | null>(null)

const selectedSprint = computed(() => {
  if (!selectedSprintId.value) return sprintStore.activeSprint
  return sprintStore.sprints.find((s) => s.id === selectedSprintId.value) ?? null
})

// ── Chart data ────────────────────────────────────────────────────────────────

const chartLabels = computed<string[]>(() =>
  sprintStore.burndownData.map((p, i) => `D${i}`),
)

const idealData = computed<number[]>(() =>
  sprintStore.burndownData.map((p) => p.ideal),
)

const actualData = computed<number[]>(() =>
  sprintStore.burndownData.map((p) => p.actual),
)

const chartData = computed<ChartData<'line'>>(() => ({
  labels: chartLabels.value,
  datasets: [
    {
      label: 'Ideal',
      data: idealData.value,
      borderColor: '#64748b',
      backgroundColor: 'transparent',
      borderDash: [6, 4],
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: '#64748b',
      tension: 0.1,
    },
    {
      label: 'Actual',
      data: actualData.value,
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.08)',
      borderWidth: 2,
      pointRadius: 4,
      pointBackgroundColor: '#3b82f6',
      fill: true,
      tension: 0.3,
    },
  ],
}))

const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  plugins: {
    legend: {
      labels: {
        color: '#94a3b8',
        font: { size: 12 },
        boxWidth: 20,
      },
    },
    tooltip: {
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderWidth: 1,
      titleColor: '#cbd5e1',
      bodyColor: '#94a3b8',
    },
    title: {
      display: false,
    },
  },
  scales: {
    x: {
      grid: {
        color: '#1e293b',
      },
      ticks: {
        color: '#64748b',
        font: { size: 11 },
      },
    },
    y: {
      grid: {
        color: '#1e293b',
      },
      ticks: {
        color: '#64748b',
        font: { size: 11 },
        stepSize: 1,
      },
      title: {
        display: true,
        text: 'Remaining Tasks',
        color: '#475569',
        font: { size: 11 },
      },
    },
  },
}))

// ── Velocity stats ────────────────────────────────────────────────────────────

const tasksCompleted = computed<number>(() => {
  const data = sprintStore.burndownData
  if (data.length === 0) return 0
  const first = data[0]?.actual ?? 0
  const last = data[data.length - 1]?.actual ?? first
  return Math.max(0, first - last)
})

const averageVelocity = computed<string>(() => {
  const data = sprintStore.burndownData
  if (data.length < 2) return '—'
  const days = data.length - 1
  return days > 0 ? (tasksCompleted.value / days).toFixed(1) : '—'
})

const sprintHealth = computed<{ label: string; colorClass: string }>(() => {
  const data = sprintStore.burndownData
  if (data.length < 2) return { label: 'Unknown', colorClass: 'text-slate-400' }

  const lastPoint = data[data.length - 1]
  if (!lastPoint) return { label: 'Unknown', colorClass: 'text-slate-400' }

  const diff = lastPoint.actual - lastPoint.ideal
  if (diff <= 0) return { label: 'On Track', colorClass: 'text-green-400' }
  if (diff <= 2) return { label: 'At Risk', colorClass: 'text-yellow-400' }
  return { label: 'Behind', colorClass: 'text-red-400' }
})

const hasChartData = computed<boolean>(() => sprintStore.burndownData.length > 0)

// ── Sprint selector ───────────────────────────────────────────────────────────

function onSprintChange(event: Event): void {
  const target = event.target as HTMLSelectElement
  selectedSprintId.value = target.value
  void sprintStore.fetchBurndown(target.value)
}

function formatSprintLabel(sprint: { number: number; status: string }): string {
  return `Sprint ${sprint.number} — ${sprint.status}`
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  const projectId = projectStore.activeProject?.id
  if (projectId) {
    void sprintStore.fetchSprints(projectId).then(() => {
      const sprint = sprintStore.activeSprint
      if (sprint) {
        selectedSprintId.value = sprint.id
        void sprintStore.fetchBurndown(sprint.id)
      }
    })
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Sprint selector -->
    <div class="flex items-center gap-4">
      <label class="text-sm text-slate-400 whitespace-nowrap" for="burndown-sprint-select">
        Sprint
      </label>
      <select
        id="burndown-sprint-select"
        class="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        :value="selectedSprintId ?? ''"
        @change="onSprintChange"
      >
        <option v-if="sprintStore.sprints.length === 0" value="" disabled>
          No sprints available
        </option>
        <option
          v-for="sprint in sprintStore.sprints"
          :key="sprint.id"
          :value="sprint.id"
        >
          {{ formatSprintLabel(sprint) }}
        </option>
      </select>
    </div>

    <!-- Burndown chart -->
    <div class="bg-slate-900 rounded-lg border border-slate-700 p-5">
      <h2 class="text-sm font-semibold text-slate-300 mb-4">Burndown Chart</h2>

      <div v-if="sprintStore.isLoading" class="flex items-center justify-center h-72">
        <span class="text-slate-500 text-sm">Loading burndown data...</span>
      </div>

      <div
        v-else-if="!hasChartData"
        class="flex items-center justify-center h-72"
      >
        <span class="text-slate-600 text-sm">No burndown data for this sprint</span>
      </div>

      <div v-else class="h-72">
        <Line :data="chartData" :options="chartOptions" />
      </div>
    </div>

    <!-- Velocity stats -->
    <div class="grid grid-cols-3 gap-4">
      <!-- Tasks completed -->
      <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <p class="text-xs text-slate-500 uppercase tracking-wide mb-2">Tasks Completed</p>
        <p class="text-3xl font-bold text-blue-400 font-mono">
          {{ tasksCompleted }}
        </p>
        <p class="text-xs text-slate-500 mt-1">this sprint</p>
      </div>

      <!-- Average velocity -->
      <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <p class="text-xs text-slate-500 uppercase tracking-wide mb-2">Average Velocity</p>
        <p class="text-3xl font-bold text-slate-200 font-mono">
          {{ averageVelocity }}
        </p>
        <p class="text-xs text-slate-500 mt-1">tasks / day</p>
      </div>

      <!-- Sprint health -->
      <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
        <p class="text-xs text-slate-500 uppercase tracking-wide mb-2">Sprint Health</p>
        <p class="text-3xl font-bold font-mono" :class="sprintHealth.colorClass">
          {{ sprintHealth.label }}
        </p>
        <p class="text-xs text-slate-500 mt-1">vs ideal pace</p>
      </div>
    </div>
  </div>
</template>
