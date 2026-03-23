<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useNamingStore } from '@/stores/naming.js'
import type { NamingViolation } from '@/stores/naming.js'

const namingStore = useNamingStore()

const fileSearchQuery = ref<string>('')
const severityFilter = ref<'ALL' | 'ERROR' | 'WARNING'>('ALL')

const violationsByFile = computed<Map<string, NamingViolation[]>>(() => {
  return namingStore.getViolationsByFile()
})

const filteredViolationsByFile = computed<[string, NamingViolation[]][]>(() => {
  const entries = Array.from(violationsByFile.value.entries())
  const query = fileSearchQuery.value.trim().toLowerCase()

  return entries
    .filter(([filePath]) => !query || filePath.toLowerCase().includes(query))
    .map(([filePath, violations]) => {
      const filtered =
        severityFilter.value === 'ALL'
          ? violations
          : violations.filter((v) => v.severity === severityFilter.value)
      return [filePath, filtered] as [string, NamingViolation[]]
    })
    .filter(([, violations]) => violations.length > 0)
})

const hasNoViolations = computed<boolean>(() => namingStore.violations.length === 0)

function severityBadgeClass(severity: NamingViolation['severity']): string {
  return severity === 'ERROR'
    ? 'bg-red-700 text-red-100'
    : 'bg-yellow-700 text-yellow-100'
}

function violationCountBadgeClass(count: number): string {
  return count > 0 ? 'bg-red-800 text-red-100' : 'bg-slate-700 text-slate-300'
}

function summaryCardClass(value: number, isHighlightable: boolean): string {
  if (isHighlightable && value > 0) return 'bg-red-950/40 border-red-800'
  return 'bg-slate-800 border-slate-700'
}

function summaryValueClass(value: number, isHighlightable: boolean): string {
  if (isHighlightable && value > 0) return 'text-red-400'
  return 'text-white'
}

onMounted(() => {
  void namingStore.fetchViolations()
  void namingStore.fetchSummary()
})
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-white">
    <!-- Page header -->
    <div class="px-6 py-5 border-b border-slate-800">
      <h1 class="text-xl font-semibold text-white">Naming Convention Report</h1>
      <p class="text-sm text-slate-400 mt-0.5">Identifier violations detected across the codebase</p>
    </div>

    <div class="px-6 py-6 space-y-6">
      <!-- Error banner -->
      <div
        v-if="namingStore.error"
        class="rounded-md bg-red-900/40 border border-red-800 text-red-400 text-sm px-4 py-3"
        role="alert"
      >
        {{ namingStore.error }}
      </div>

      <!-- Loading state -->
      <div v-if="namingStore.isLoading" class="flex items-center justify-center py-16">
        <span class="text-slate-500 text-sm">Loading violations…</span>
      </div>

      <template v-else>
        <!-- Summary cards -->
        <div class="grid grid-cols-4 gap-4">
          <!-- Total violations -->
          <div
            class="rounded-lg border p-4 transition-colors"
            :class="summaryCardClass(namingStore.summary?.totalViolations ?? 0, true)"
          >
            <div class="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
              Total Violations
            </div>
            <div
              class="text-3xl font-bold"
              :class="summaryValueClass(namingStore.summary?.totalViolations ?? 0, true)"
            >
              {{ namingStore.summary?.totalViolations ?? 0 }}
            </div>
          </div>

          <!-- Errors -->
          <div
            class="rounded-lg border p-4 transition-colors"
            :class="summaryCardClass(namingStore.summary?.errorCount ?? 0, true)"
          >
            <div class="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
              Errors
            </div>
            <div
              class="text-3xl font-bold"
              :class="summaryValueClass(namingStore.summary?.errorCount ?? 0, true)"
            >
              {{ namingStore.summary?.errorCount ?? 0 }}
            </div>
          </div>

          <!-- Warnings -->
          <div class="rounded-lg border bg-slate-800 border-slate-700 p-4">
            <div class="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
              Warnings
            </div>
            <div class="text-3xl font-bold text-yellow-400">
              {{ namingStore.summary?.warningCount ?? 0 }}
            </div>
          </div>

          <!-- Files affected -->
          <div class="rounded-lg border bg-slate-800 border-slate-700 p-4">
            <div class="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
              Files Affected
            </div>
            <div class="text-3xl font-bold text-white">
              {{ namingStore.summary?.filesAffected ?? 0 }}
            </div>
          </div>
        </div>

        <!-- All-clear state -->
        <div
          v-if="hasNoViolations"
          class="flex flex-col items-center justify-center py-20 text-center"
        >
          <div class="text-5xl text-green-500 mb-4">&#10003;</div>
          <p class="text-green-400 font-semibold text-lg">All naming conventions followed</p>
          <p class="text-slate-500 text-sm mt-1">No violations detected in the codebase.</p>
        </div>

        <template v-else>
          <!-- Filter controls -->
          <div class="flex flex-wrap items-center gap-3">
            <input
              v-model="fileSearchQuery"
              type="text"
              placeholder="Filter by file path…"
              class="flex-1 min-w-52 rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <div class="flex rounded-md overflow-hidden border border-slate-700">
              <button
                v-for="option in ['ALL', 'ERROR', 'WARNING'] as const"
                :key="option"
                class="px-3 py-2 text-xs font-medium transition-colors"
                :class="
                  severityFilter === option
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                "
                @click="severityFilter = option"
              >
                {{ option }}
              </button>
            </div>
          </div>

          <!-- File-grouped violation list -->
          <div class="space-y-4">
            <div
              v-for="[filePath, violations] in filteredViolationsByFile"
              :key="filePath"
              class="rounded-lg border border-slate-700 overflow-hidden"
            >
              <!-- File path header -->
              <div class="flex items-center justify-between px-4 py-2.5 bg-slate-800">
                <span class="text-sm font-mono text-slate-300 truncate">{{ filePath }}</span>
                <span
                  class="shrink-0 ml-3 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold"
                  :class="violationCountBadgeClass(violations.length)"
                >
                  {{ violations.length }}
                </span>
              </div>

              <!-- Violations list -->
              <ul class="divide-y divide-slate-800">
                <li
                  v-for="violation in violations"
                  :key="violation.id"
                  class="px-4 py-3 bg-slate-900 flex flex-wrap items-start gap-x-3 gap-y-1"
                >
                  <!-- Line number -->
                  <span class="text-xs text-slate-500 font-mono pt-0.5 w-14 shrink-0">
                    L{{ violation.line }}
                  </span>

                  <!-- Severity badge -->
                  <span
                    class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold uppercase shrink-0"
                    :class="severityBadgeClass(violation.severity)"
                  >
                    {{ violation.severity }}
                  </span>

                  <!-- Identifier and expected -->
                  <div class="flex-1 min-w-0">
                    <span class="text-sm text-white font-mono">{{ violation.identifier }}</span>
                    <span class="text-sm text-slate-400 ml-2">
                      &mdash; expected <span class="text-slate-300">{{ violation.expectedFormat }}</span>
                    </span>

                    <!-- Suggestion -->
                    <div v-if="violation.suggestion" class="mt-0.5 text-xs text-cyan-400 font-mono">
                      &rarr; {{ violation.suggestion }}
                    </div>
                  </div>
                </li>
              </ul>
            </div>

            <div
              v-if="filteredViolationsByFile.length === 0"
              class="py-10 text-center text-slate-500 text-sm"
            >
              No violations match your filters.
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
