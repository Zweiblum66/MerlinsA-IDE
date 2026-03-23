<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Doughnut, Bar, Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { useTokenStore } from '@/stores/tokens.js'
import { useProjectStore } from '@/stores/project.js'
import type { ChartData, ChartOptions } from 'chart.js'

ChartJS.register(
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
)

const tokenStore = useTokenStore()
const projectStore = useProjectStore()

// ── Budget overview ───────────────────────────────────────────────────────────

const budgetPercentUsed = computed<number>(() => tokenStore.budgetInfo?.percentUsed ?? 0)

const budgetBarColorClass = computed<string>(() => {
  const pct = budgetPercentUsed.value
  if (pct > 85) return 'bg-red-500'
  if (pct > 70) return 'bg-yellow-500'
  return 'bg-green-500'
})

const budgetTextColorClass = computed<string>(() => {
  const pct = budgetPercentUsed.value
  if (pct > 85) return 'text-red-400'
  if (pct > 70) return 'text-yellow-400'
  return 'text-green-400'
})

const willExceedBudget = computed<boolean>(() => tokenStore.budgetInfo?.willExceed ?? false)

function formatUsd(value: number): string {
  return value.toFixed(2)
}

// ── Doughnut chart: tokens by model ──────────────────────────────────────────

const MODEL_COLORS: string[] = [
  '#3b82f6', // blue-500 — sonnet
  '#06b6d4', // cyan-500 — haiku
  '#8b5cf6', // violet-500 — opus
  '#10b981', // emerald-500 — fallback
  '#f59e0b', // amber-500 — fallback
]

const doughnutData = computed<ChartData<'doughnut'>>(() => ({
  labels: tokenStore.tokensByModel.map((m) => m.model),
  datasets: [
    {
      data: tokenStore.tokensByModel.map((m) => m.totalTokens),
      backgroundColor: tokenStore.tokensByModel.map((_, i) => MODEL_COLORS[i % MODEL_COLORS.length] ?? '#64748b'),
      borderColor: '#0f172a',
      borderWidth: 2,
      hoverOffset: 6,
    },
  ],
}))

const doughnutOptions = computed<ChartOptions<'doughnut'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        color: '#94a3b8',
        font: { size: 11 },
        boxWidth: 14,
        padding: 12,
      },
    },
    tooltip: {
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderWidth: 1,
      titleColor: '#cbd5e1',
      bodyColor: '#94a3b8',
      callbacks: {
        label: (ctx) => {
          const value = ctx.raw as number
          return ` ${value.toLocaleString()} tokens`
        },
      },
    },
  },
}))

// ── Bar chart: tokens by agent ────────────────────────────────────────────────

const AGENT_BAR_COLOR = '#3b82f6'

const barData = computed<ChartData<'bar'>>(() => ({
  labels: tokenStore.tokensByAgent.map((a) => a.agentName),
  datasets: [
    {
      label: 'Tokens',
      data: tokenStore.tokensByAgent.map((a) => a.totalTokens),
      backgroundColor: `${AGENT_BAR_COLOR}99`,
      borderColor: AGENT_BAR_COLOR,
      borderWidth: 1,
      borderRadius: 4,
    },
  ],
}))

const barOptions = computed<ChartOptions<'bar'>>(() => ({
  indexAxis: 'y' as const,
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderWidth: 1,
      titleColor: '#cbd5e1',
      bodyColor: '#94a3b8',
      callbacks: {
        label: (ctx) => {
          const value = ctx.raw as number
          return ` ${value.toLocaleString()} tokens`
        },
      },
    },
  },
  scales: {
    x: {
      grid: { color: '#1e293b' },
      ticks: { color: '#64748b', font: { size: 11 } },
    },
    y: {
      grid: { display: false },
      ticks: { color: '#94a3b8', font: { size: 11 } },
    },
  },
}))

// ── Timeline line chart ───────────────────────────────────────────────────────

const timelineChartData = computed<ChartData<'line'>>(() => ({
  labels: tokenStore.timeline.map((p) => p.date),
  datasets: [
    {
      label: 'Daily Tokens',
      data: tokenStore.timeline.map((p) => p.tokens),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.12)',
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: '#3b82f6',
      fill: true,
      tension: 0.4,
    },
  ],
}))

const timelineOptions = computed<ChartOptions<'line'>>(() => ({
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
        boxWidth: 18,
      },
    },
    tooltip: {
      backgroundColor: '#1e293b',
      borderColor: '#334155',
      borderWidth: 1,
      titleColor: '#cbd5e1',
      bodyColor: '#94a3b8',
      callbacks: {
        label: (ctx) => {
          const value = ctx.raw as number
          return ` ${value.toLocaleString()} tokens`
        },
      },
    },
  },
  scales: {
    x: {
      grid: { color: '#1e293b' },
      ticks: { color: '#64748b', font: { size: 11 } },
    },
    y: {
      grid: { color: '#1e293b' },
      ticks: {
        color: '#64748b',
        font: { size: 11 },
        callback: (value) => {
          const n = typeof value === 'number' ? value : Number(value)
          if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
          if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
          return String(n)
        },
      },
      title: {
        display: true,
        text: 'Tokens',
        color: '#475569',
        font: { size: 11 },
      },
    },
  },
}))

// ── Derived flags ─────────────────────────────────────────────────────────────

const hasDoughnutData = computed<boolean>(() => tokenStore.tokensByModel.length > 0)
const hasBarData = computed<boolean>(() => tokenStore.tokensByAgent.length > 0)
const hasTimelineData = computed<boolean>(() => tokenStore.timeline.length > 0)

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  const projectId = projectStore.activeProject?.id
  if (projectId) {
    void tokenStore.fetchTokenUsage(projectId)
    void tokenStore.fetchBudget(projectId)
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Budget overview card -->
    <div class="bg-slate-800 rounded-lg border border-slate-700 p-5">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h2 class="text-sm font-semibold text-slate-300">Budget Overview</h2>
          <p v-if="tokenStore.budgetInfo" class="text-xs text-slate-500 mt-0.5">
            <span :class="budgetTextColorClass" class="font-semibold">
              ${{ formatUsd(tokenStore.budgetInfo.spentUsd) }}
            </span>
            spent of
            <span class="text-slate-400">${{ formatUsd(tokenStore.budgetInfo.budgetUsd) }}</span>
            budget
            <span class="ml-1">({{ budgetPercentUsed.toFixed(1) }}%)</span>
          </p>
          <p v-else class="text-xs text-slate-600 mt-0.5">Loading budget data...</p>
        </div>

        <!-- Will Exceed warning -->
        <div
          v-if="willExceedBudget"
          class="flex items-center gap-2 bg-red-900/40 border border-red-700 text-red-400 text-xs px-3 py-1.5 rounded-md"
        >
          <span class="text-base leading-none">⚠</span>
          <span class="font-semibold">Will Exceed Budget</span>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
        <div
          class="h-3 rounded-full transition-all duration-500"
          :class="budgetBarColorClass"
          :style="{ width: `${Math.min(100, budgetPercentUsed)}%` }"
        />
      </div>

      <!-- Budget remaining -->
      <div v-if="tokenStore.budgetInfo" class="flex justify-end mt-2">
        <span class="text-xs text-slate-500">
          ${{ formatUsd(tokenStore.budgetInfo.remainingUsd) }} remaining
        </span>
      </div>
    </div>

    <!-- Two charts side by side -->
    <div class="grid grid-cols-2 gap-6">
      <!-- Doughnut: usage by model -->
      <div class="bg-slate-800 rounded-lg border border-slate-700 p-5">
        <h3 class="text-sm font-semibold text-slate-300 mb-4">Usage by Model</h3>

        <div v-if="tokenStore.isLoading" class="flex items-center justify-center h-52">
          <span class="text-slate-500 text-sm">Loading...</span>
        </div>

        <div v-else-if="!hasDoughnutData" class="flex items-center justify-center h-52">
          <span class="text-slate-600 text-sm">No model data available</span>
        </div>

        <div v-else class="h-52">
          <Doughnut :data="doughnutData" :options="doughnutOptions" />
        </div>
      </div>

      <!-- Bar: usage by agent -->
      <div class="bg-slate-800 rounded-lg border border-slate-700 p-5">
        <h3 class="text-sm font-semibold text-slate-300 mb-4">Usage by Agent</h3>

        <div v-if="tokenStore.isLoading" class="flex items-center justify-center h-52">
          <span class="text-slate-500 text-sm">Loading...</span>
        </div>

        <div v-else-if="!hasBarData" class="flex items-center justify-center h-52">
          <span class="text-slate-600 text-sm">No agent data available</span>
        </div>

        <div v-else class="h-52">
          <Bar :data="barData" :options="barOptions" />
        </div>
      </div>
    </div>

    <!-- Timeline chart -->
    <div class="bg-slate-800 rounded-lg border border-slate-700 p-5">
      <h3 class="text-sm font-semibold text-slate-300 mb-4">Daily Token Spend</h3>

      <div v-if="tokenStore.isLoading" class="flex items-center justify-center h-64">
        <span class="text-slate-500 text-sm">Loading timeline...</span>
      </div>

      <div v-else-if="!hasTimelineData" class="flex items-center justify-center h-64">
        <span class="text-slate-600 text-sm">No timeline data available</span>
      </div>

      <div v-else class="h-64">
        <Line :data="timelineChartData" :options="timelineOptions" />
      </div>
    </div>

    <!-- Token totals summary row -->
    <div v-if="tokenStore.tokensByModel.length > 0" class="grid grid-cols-3 gap-4">
      <div
        v-for="model in tokenStore.tokensByModel"
        :key="model.model"
        class="bg-slate-900 rounded-lg p-4 border border-slate-700"
      >
        <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">{{ model.model }}</p>
        <p class="text-xl font-bold text-slate-200 font-mono">
          {{ model.totalTokens.toLocaleString() }}
        </p>
        <div class="flex justify-between mt-1">
          <span class="text-xs text-slate-500">
            In: {{ model.inputTokens.toLocaleString() }}
          </span>
          <span class="text-xs text-slate-500">
            Out: {{ model.outputTokens.toLocaleString() }}
          </span>
        </div>
        <p class="text-xs text-slate-500 mt-1 font-mono">
          ${{ model.costUsd.toFixed(4) }}
        </p>
      </div>
    </div>
  </div>
</template>
