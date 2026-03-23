import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '../composables/use-api.js'

export interface Project {
  id: string
  name: string
  description: string
  status: string
  createdAt: number
  updatedAt: number
}

export interface CreateProjectPayload {
  name: string
  description: string
}

/**
 * Project store. Manages the list of projects and the currently active project.
 */
export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const activeProject = ref<Project | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const api = useApi()

  async function fetchProjects(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const result = await api.get<Project[]>('/projects')
      projects.value = result
      if (!activeProject.value && result.length > 0) {
        activeProject.value = result[0] ?? null
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch projects'
    } finally {
      isLoading.value = false
    }
  }

  function setActiveProject(project: Project): void {
    activeProject.value = project
  }

  async function createProject(payload: CreateProjectPayload): Promise<Project> {
    isLoading.value = true
    error.value = null
    try {
      const created = await api.post<Project>('/projects', payload)
      projects.value.push(created)
      return created
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create project'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    projects,
    activeProject,
    isLoading,
    error,
    fetchProjects,
    setActiveProject,
    createProject,
  }
})
