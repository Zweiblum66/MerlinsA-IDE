<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useSse } from '@/composables/use-sse.js'
import { useProjectStore } from '@/stores/project.js'
import { useAgentStore } from '@/stores/agents.js'
import { useSprintStore } from '@/stores/sprint.js'
import { useTokenStore } from '@/stores/tokens.js'
import type { AgentSession, RecentActivity } from '@/stores/agents.js'
import type { Sprint } from '@/stores/sprint.js'
import type { BudgetInfo } from '@/stores/tokens.js'

const route = useRoute()
const router = useRouter()

const projectStore = useProjectStore()
const agentStore = useAgentStore()
const sprintStore = useSprintStore()
const tokenStore = useTokenStore()

const { isConnected, onEvent } = useSse()

interface NavItem {
  name: string
  path: string
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { name: 'dashboard', path: '/', label: 'Dashboard', icon: '■' },
  { name: 'board', path: '/board', label: 'Sprint Board', icon: '▦' },
  { name: 'agents', path: '/agents', label: 'Agents', icon: '◈' },
  { name: 'burndown', path: '/burndown', label: 'Burndown', icon: '◉' },
  { name: 'tokens', path: '/tokens', label: 'Tokens', icon: '◎' },
  { name: 'contracts', path: '/contracts', label: 'Contracts', icon: '◇' },
  { name: 'naming', path: '/naming', label: 'Naming', icon: '◻' },
  { name: 'wizard', path: '/wizard', label: 'Wizard', icon: '✦' },
  { name: 'audit', path: '/audit', label: 'Audit', icon: '◆' },
]

const isPublicRoute = computed<boolean>(() => route.meta.isPublic === true)

const currentPageTitle = computed<string>(() => {
  const found = NAV_ITEMS.find((item) => item.name === route.name)
  return found?.label ?? 'MerlinsA-IDE'
})

const activeProjectName = computed<string>(
  () => projectStore.activeProject?.name ?? 'No project selected',
)

function isActiveRoute(path: string): boolean {
  if (path === '/') {
    return route.path === '/'
  }
  return route.path.startsWith(path)
}

onMounted(() => {
  void projectStore.fetchProjects()

  onEvent('agent:started', (data) => {
    agentStore.updateSessionFromEvent(data as AgentSession & { id: string })
    agentStore.addActivity(data as RecentActivity)
  })

  onEvent('agent:completed', (data) => {
    agentStore.updateSessionFromEvent(data as AgentSession & { id: string })
    agentStore.addActivity(data as RecentActivity)
  })

  onEvent('task:updated', (_data) => {
    const projectId = projectStore.activeProject?.id
    if (projectId) {
      void projectStore.fetchProjects()
    }
  })

  onEvent('sprint:updated', (data) => {
    const updated = data as Sprint
    const index = sprintStore.sprints.findIndex((s) => s.id === updated.id)
    if (index !== -1) {
      sprintStore.sprints[index] = updated
    }
    if (sprintStore.activeSprint?.id === updated.id) {
      sprintStore.activeSprint = updated
    }
  })

  onEvent('token:usage', (data) => {
    const budget = data as BudgetInfo
    if (tokenStore.budgetInfo && budget.projectId === tokenStore.budgetInfo.projectId) {
      tokenStore.budgetInfo = budget
    }
  })
})

async function handleLogout(): Promise<void> {
  localStorage.removeItem('jwt')
  await router.push({ name: 'login' })
}
</script>

<template>
  <!-- Public routes (e.g. login) render without the shell -->
  <RouterView v-if="isPublicRoute" />

  <!-- Authenticated shell layout -->
  <div v-else class="flex h-screen bg-slate-950 overflow-hidden">
    <!-- Left sidebar -->
    <aside class="w-64 flex flex-col bg-slate-900 border-r border-slate-700 shrink-0">
      <!-- Logo -->
      <div class="h-14 flex items-center px-5 border-b border-slate-700">
        <span class="text-blue-500 font-bold text-lg tracking-tight">MerlinsA-IDE</span>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto py-3 px-2">
        <RouterLink
          v-for="item in NAV_ITEMS"
          :key="item.name"
          :to="item.path"
          class="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors mb-0.5"
          :class="
            isActiveRoute(item.path)
              ? 'bg-slate-800 text-blue-400 font-medium'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          "
        >
          <span class="text-base leading-none">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <!-- Bottom: SSE status + logout -->
      <div class="px-4 py-4 border-t border-slate-700 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span
            class="inline-block w-2.5 h-2.5 rounded-full"
            :class="isConnected ? 'bg-green-500' : 'bg-red-500'"
          />
          <span class="text-xs text-slate-400">
            {{ isConnected ? 'Live' : 'Disconnected' }}
          </span>
        </div>
        <button
          class="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          @click="handleLogout"
        >
          Sign out
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- Top bar -->
      <header class="h-14 flex items-center justify-between px-6 bg-slate-900 border-b border-slate-700 shrink-0">
        <h1 class="text-sm font-semibold text-white">{{ currentPageTitle }}</h1>

        <div class="flex items-center gap-3">
          <span class="text-sm text-slate-400">{{ activeProjectName }}</span>

          <span
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            :class="
              isConnected
                ? 'bg-green-900/40 text-green-400 border border-green-800'
                : 'bg-red-900/40 text-red-400 border border-red-800'
            "
          >
            <span
              class="inline-block w-1.5 h-1.5 rounded-full"
              :class="isConnected ? 'bg-green-400' : 'bg-red-400'"
            />
            {{ isConnected ? 'Connected' : 'Offline' }}
          </span>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 overflow-auto p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
