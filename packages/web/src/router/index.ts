import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/DashboardView.vue'),
  },
  {
    path: '/board',
    name: 'board',
    component: () => import('../views/SprintBoardView.vue'),
  },
  {
    path: '/agents',
    name: 'agents',
    component: () => import('../views/AgentMonitorView.vue'),
  },
  {
    path: '/burndown',
    name: 'burndown',
    component: () => import('../views/BurndownView.vue'),
  },
  {
    path: '/tokens',
    name: 'tokens',
    component: () => import('../views/TokenAnalyticsView.vue'),
  },
  {
    path: '/contracts',
    name: 'contracts',
    component: () => import('../views/ContractBrowserView.vue'),
  },
  {
    path: '/naming',
    name: 'naming',
    component: () => import('../views/NamingReportView.vue'),
  },
  {
    path: '/wizard',
    name: 'wizard',
    component: () => import('../views/WizardView.vue'),
  },
  {
    path: '/audit',
    name: 'audit',
    component: () => import('../views/AuditView.vue'),
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { isPublic: true },
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const isPublic = to.meta.isPublic === true
  const token = localStorage.getItem('jwt')

  if (!isPublic && !token) {
    return { name: 'login' }
  }
})
