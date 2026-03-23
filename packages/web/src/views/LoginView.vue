<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '@/composables/use-api.js'

interface LoginResponse {
  token: string
}

const router = useRouter()
const api = useApi()

const projectId = ref<string>('')
const isLoading = ref<boolean>(false)
const errorMessage = ref<string | null>(null)

async function handleSubmit(): Promise<void> {
  const trimmedId = projectId.value.trim()
  if (!trimmedId) {
    errorMessage.value = 'Please enter a Project ID.'
    return
  }

  isLoading.value = true
  errorMessage.value = null

  try {
    const response = await api.post<LoginResponse>('/auth/login', { projectId: trimmedId })
    localStorage.setItem('jwt', response.token)
    await router.push({ name: 'dashboard' })
  } catch (err) {
    errorMessage.value =
      err instanceof Error ? err.message : 'Login failed. Check your Project ID and try again.'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 flex items-start justify-center pt-20 px-4">
    <div class="w-full max-w-md">
      <!-- Logo / branding -->
      <div class="text-center mb-8">
        <span class="text-4xl font-bold text-blue-500 tracking-tight">MerlinsA-IDE</span>
        <p class="mt-2 text-sm text-slate-400">AI-powered IDE orchestration layer</p>
      </div>

      <!-- Card -->
      <div class="bg-slate-800 rounded-lg shadow-lg p-8 border border-slate-700">
        <h2 class="text-lg font-semibold text-white mb-6">Enter the IDE</h2>

        <form @submit.prevent="handleSubmit" novalidate>
          <!-- Project ID input -->
          <div class="mb-4">
            <label for="projectId" class="block text-sm font-medium text-slate-300 mb-1.5">
              Project ID
            </label>
            <input
              id="projectId"
              v-model="projectId"
              type="text"
              placeholder="e.g. proj-abc123"
              autocomplete="off"
              class="w-full rounded-md bg-slate-900 border border-slate-600 text-white placeholder-slate-500 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              :disabled="isLoading"
            />
          </div>

          <!-- Error message -->
          <div
            v-if="errorMessage"
            class="mb-4 rounded-md bg-red-900/40 border border-red-800 text-red-400 text-sm px-3 py-2.5"
            role="alert"
          >
            {{ errorMessage }}
          </div>

          <!-- Submit button -->
          <button
            type="submit"
            class="w-full rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm px-4 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800"
            :disabled="isLoading"
          >
            <span v-if="isLoading">Signing in...</span>
            <span v-else>Enter IDE</span>
          </button>
        </form>
      </div>

      <!-- Footer note -->
      <p class="mt-6 text-center text-xs text-slate-600">
        Powered by the Claude Code Agent SDK
      </p>
    </div>
  </div>
</template>
