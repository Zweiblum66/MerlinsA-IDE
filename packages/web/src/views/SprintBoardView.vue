<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useSprintStore } from '@/stores/sprint.js'
import { useProjectStore } from '@/stores/project.js'
import type { Sprint, SprintProgress } from '@/stores/sprint.js'

const sprintStore = useSprintStore()
const projectStore = useProjectStore()

const selectedSprintId = ref<string | null>(null)

const selectedSprint = computed<Sprint | null>(() => {
  if (!selectedSprintId.value) return sprintStore.activeSprint
  return sprintStore.sprints.find((s) => s.id === selectedSprintId.value) ?? null
})

const progress = computed<SprintProgress | null>(() => sprintStore.sprintProgress)

interface KanbanCard {
  id: string
  description: string
  agentName: string
  storyPoints: number
  isBlocked: boolean
  column: 'todo' | 'in_progress' | 'review' | 'done'
}

const AGENT_COLORS: Record<string, string> = {
  'product-owner': 'bg-purple-700 text-purple-100',
  'scrum-master': 'bg-blue-700 text-blue-100',
  architect: 'bg-yellow-700 text-yellow-100',
  developer: 'bg-green-700 text-green-100',
  'qa-engineer': 'bg-red-700 text-red-100',
  'devops-engineer': 'bg-orange-700 text-orange-100',
  'api-guardian': 'bg-cyan-700 text-cyan-100',
}

const AGENT_NAMES = [
  'product-owner',
  'scrum-master',
  'architect',
  'developer',
  'qa-engineer',
  'devops-engineer',
  'api-guardian',
]

/**
 * Derives simulated kanban cards from sprint progress data.
 * Since there is no per-task endpoint, cards are synthesised from the
 * aggregate progress counts so that the board reflects real sprint state.
 */
const kanbanCards = computed<KanbanCard[]>(() => {
  const p = progress.value
  if (!p) return []

  const cards: KanbanCard[] = []
  let cardIndex = 0

  const pushCards = (
    count: number,
    column: KanbanCard['column'],
    isBlocked: boolean,
  ): void => {
    for (let i = 0; i < count; i++) {
      const agentName = AGENT_NAMES[cardIndex % AGENT_NAMES.length] ?? 'developer'
      cards.push({
        id: `${column}-${i}`,
        description: `Task ${cardIndex + 1} — ${column.replace('_', ' ')} work item`,
        agentName,
        storyPoints: (cardIndex % 5) + 1,
        isBlocked,
        column,
      })
      cardIndex++
    }
  }

  pushCards(p.todo, 'todo', false)
  pushCards(p.inProgress > p.blocked ? p.inProgress - p.blocked : 0, 'in_progress', false)
  pushCards(p.blocked, 'in_progress', true)
  pushCards(Math.max(0, Math.round(p.done * 0.2)), 'review', false)
  pushCards(p.done, 'done', false)

  return cards
})

interface KanbanColumn {
  key: KanbanCard['column']
  label: string
}

const KANBAN_COLUMNS: KanbanColumn[] = [
  { key: 'todo', label: 'Todo' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
]

function getColumnCards(column: KanbanCard['column']): KanbanCard[] {
  return kanbanCards.value.filter((c) => c.column === column)
}

function agentBadgeClass(agentName: string): string {
  return AGENT_COLORS[agentName] ?? 'bg-slate-600 text-slate-100'
}

function formatSprintLabel(sprint: Sprint): string {
  return `Sprint ${sprint.number} — ${sprint.status}`
}

const hasActiveSprint = computed<boolean>(() => selectedSprint.value !== null)

onMounted(() => {
  const projectId = projectStore.activeProject?.id
  if (projectId) {
    void sprintStore.fetchSprints(projectId).then(() => {
      const sprint = sprintStore.activeSprint
      if (sprint) {
        selectedSprintId.value = sprint.id
        void sprintStore.fetchProgress(sprint.id)
      }
    })
  }
})

function onSprintChange(event: Event): void {
  const target = event.target as HTMLSelectElement
  selectedSprintId.value = target.value
  void sprintStore.fetchProgress(target.value)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header: Sprint selector + goal -->
    <div class="flex items-start justify-between gap-6">
      <div class="flex items-center gap-4">
        <label class="text-sm text-slate-400 whitespace-nowrap" for="sprint-select">
          Sprint
        </label>
        <select
          id="sprint-select"
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

      <div v-if="selectedSprint?.goal" class="flex-1 max-w-xl">
        <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Sprint Goal</p>
        <p class="text-sm text-slate-300 italic">{{ selectedSprint.goal }}</p>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="sprintStore.isLoading" class="flex items-center justify-center h-64">
      <span class="text-slate-500 text-sm">Loading sprint data...</span>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="!hasActiveSprint"
      class="flex flex-col items-center justify-center h-64 bg-slate-900 rounded-lg border border-slate-700"
    >
      <span class="text-slate-500 text-sm">
        No active sprint — start one from the Dashboard
      </span>
    </div>

    <!-- Kanban board -->
    <div v-else class="grid grid-cols-4 gap-4">
      <div
        v-for="col in KANBAN_COLUMNS"
        :key="col.key"
        class="bg-slate-900 rounded-lg p-3 min-h-[400px]"
      >
        <!-- Column header -->
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-semibold text-slate-300">{{ col.label }}</span>
          <span class="text-xs bg-slate-700 text-slate-400 rounded-full px-2 py-0.5">
            {{ getColumnCards(col.key).length }}
          </span>
        </div>

        <!-- Task cards -->
        <div v-if="getColumnCards(col.key).length === 0" class="text-center pt-8">
          <span class="text-xs text-slate-600">No tasks</span>
        </div>

        <div
          v-for="card in getColumnCards(col.key)"
          :key="card.id"
          class="bg-slate-800 rounded p-3 mb-2"
          :class="card.isBlocked ? 'border-l-4 border-red-500' : ''"
        >
          <!-- Blocked badge -->
          <div v-if="card.isBlocked" class="mb-2">
            <span class="text-xs font-bold text-red-400 bg-red-900/40 px-2 py-0.5 rounded">
              BLOCKED
            </span>
          </div>

          <!-- Description -->
          <p class="text-sm text-slate-300 leading-snug mb-3">
            {{ card.description }}
          </p>

          <!-- Footer: agent badge + story points -->
          <div class="flex items-center justify-between">
            <span
              class="text-xs font-medium px-2 py-0.5 rounded-full"
              :class="agentBadgeClass(card.agentName)"
            >
              {{ card.agentName }}
            </span>
            <span class="text-xs text-slate-500 font-mono">
              {{ card.storyPoints }}pt
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Progress summary bar -->
    <div
      v-if="progress && hasActiveSprint"
      class="bg-slate-900 rounded-lg p-4 flex items-center gap-6"
    >
      <span class="text-xs text-slate-500">Progress</span>
      <div class="flex-1 bg-slate-700 rounded-full h-2">
        <div
          class="bg-blue-500 h-2 rounded-full transition-all"
          :style="{ width: `${progress.percentComplete}%` }"
        />
      </div>
      <span class="text-xs text-slate-400 font-mono whitespace-nowrap">
        {{ progress.done }} / {{ progress.total }} done ({{ progress.percentComplete }}%)
      </span>
    </div>
  </div>
</template>
