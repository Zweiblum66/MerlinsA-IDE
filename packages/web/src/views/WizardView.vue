<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '@/composables/use-api.js'

// ── Types ──────────────────────────────────────────────────────────────────

type FrontendChoice = 'Vue' | 'React' | 'None'
type BackendChoice = 'Fastify' | 'Express' | 'None'
type DatabaseChoice = 'SQLite' | 'PostgreSQL' | 'None'
type ArchitectureChoice = 'Monolith' | 'Modular Monolith' | 'Microservices'
type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH'

interface RiskCard {
  label: string
  severity: RiskSeverity
  description: string
}

interface WizardState {
  // Step 1 – Vision
  projectName: string
  projectDescription: string
  problemStatement: string
  // Step 2 – Scope
  coreFeatures: string
  niceToHaveFeatures: string
  outOfScopeItems: string
  // Step 3 – Tech Stack
  frontend: FrontendChoice
  backend: BackendChoice
  database: DatabaseChoice
  // Step 4 – Architecture
  architecture: ArchitectureChoice
  // Step 6 – Sprint Plan
  sprintCount: number
  velocityEstimate: number
}

interface StepDefinition {
  number: number
  label: string
}

// ── Constants ──────────────────────────────────────────────────────────────

const TOTAL_STEPS = 8

const STEPS: StepDefinition[] = [
  { number: 1, label: 'Vision' },
  { number: 2, label: 'Scope' },
  { number: 3, label: 'Tech Stack' },
  { number: 4, label: 'Architecture' },
  { number: 5, label: 'WBS' },
  { number: 6, label: 'Sprint Plan' },
  { number: 7, label: 'Risk Assessment' },
  { number: 8, label: 'Generate' },
]

const RISK_CARDS: RiskCard[] = [
  {
    label: 'Scope',
    severity: 'MEDIUM',
    description: 'Requirements may expand beyond initial definition. Use time-boxed sprints to contain scope creep.',
  },
  {
    label: 'Complexity',
    severity: 'MEDIUM',
    description: 'Technical complexity could exceed initial estimates. Plan for spikes in early sprints.',
  },
  {
    label: 'Technical',
    severity: 'LOW',
    description: 'Technology choices are proven and well-supported. Monitor for breaking changes in dependencies.',
  },
  {
    label: 'Dependency',
    severity: 'HIGH',
    description: 'External dependencies (APIs, services) may introduce integration delays or breaking changes.',
  },
]

// ── Composables ────────────────────────────────────────────────────────────

const router = useRouter()
const api = useApi()

// ── Reactive state ─────────────────────────────────────────────────────────

const currentStep = ref<number>(1)
const isSubmitting = ref<boolean>(false)
const submitError = ref<string | null>(null)

const wizardState = ref<WizardState>({
  projectName: '',
  projectDescription: '',
  problemStatement: '',
  coreFeatures: '',
  niceToHaveFeatures: '',
  outOfScopeItems: '',
  frontend: 'Vue',
  backend: 'Fastify',
  database: 'SQLite',
  architecture: 'Modular Monolith',
  sprintCount: 4,
  velocityEstimate: 20,
})

// ── Computed ───────────────────────────────────────────────────────────────

const isFirstStep = computed<boolean>(() => currentStep.value === 1)
const isLastStep = computed<boolean>(() => currentStep.value === TOTAL_STEPS)

const wbsTree = computed<string[]>(() => {
  const features = wizardState.value.coreFeatures
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)

  if (features.length === 0) return ['No core features defined.']

  const lines: string[] = []
  features.forEach((feature, idx) => {
    lines.push(`Epic ${idx + 1}: ${feature}`)
    lines.push(`  Story ${idx + 1}.1: Design & spec`)
    lines.push(`    Task: Write acceptance criteria`)
    lines.push(`  Story ${idx + 1}.2: Implementation`)
    lines.push(`    Task: Build core logic`)
    lines.push(`    Task: Write unit tests`)
    lines.push(`  Story ${idx + 1}.3: Review & merge`)
  })
  return lines
})

const sprintAllocation = computed<string[]>(() => {
  const features = wizardState.value.coreFeatures
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)

  const count = wizardState.value.sprintCount
  const velocity = wizardState.value.velocityEstimate
  const lines: string[] = []

  for (let sprint = 1; sprint <= count; sprint++) {
    const startIdx = (sprint - 1) * Math.ceil(features.length / count)
    const endIdx = sprint * Math.ceil(features.length / count)
    const sprintFeatures = features.slice(startIdx, endIdx)
    lines.push(`Sprint ${sprint} (${velocity} pts):`)
    if (sprintFeatures.length > 0) {
      sprintFeatures.forEach((f) => lines.push(`  - ${f}`))
    } else {
      lines.push('  - Buffer / hardening')
    }
  }
  return lines
})

// ── Methods ────────────────────────────────────────────────────────────────

function goNext(): void {
  if (currentStep.value < TOTAL_STEPS) {
    currentStep.value++
  }
}

function goBack(): void {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

function stepStateClass(step: StepDefinition): string {
  if (step.number < currentStep.value) return 'text-blue-400 border-blue-500'
  if (step.number === currentStep.value) return 'text-white border-white bg-blue-600'
  return 'text-slate-500 border-slate-600'
}

function stepLabelClass(step: StepDefinition): string {
  if (step.number === currentStep.value) return 'text-white'
  if (step.number < currentStep.value) return 'text-blue-400'
  return 'text-slate-500'
}

function riskSeverityClass(severity: RiskSeverity): string {
  if (severity === 'HIGH') return 'bg-red-700 text-red-100'
  if (severity === 'MEDIUM') return 'bg-yellow-700 text-yellow-100'
  return 'bg-green-800 text-green-100'
}

function riskCardBorderClass(severity: RiskSeverity): string {
  if (severity === 'HIGH') return 'border-red-800 bg-red-950/20'
  if (severity === 'MEDIUM') return 'border-yellow-800 bg-yellow-950/20'
  return 'border-green-900 bg-green-950/20'
}

interface CreateProjectPayload {
  name: string
  description: string
  problemStatement: string
  coreFeatures: string[]
  niceToHaveFeatures: string[]
  outOfScopeItems: string[]
  frontend: FrontendChoice
  backend: BackendChoice
  database: DatabaseChoice
  architecture: ArchitectureChoice
  sprintCount: number
  velocityEstimate: number
}

async function createProject(): Promise<void> {
  isSubmitting.value = true
  submitError.value = null

  const splitLines = (text: string): string[] =>
    text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

  const payload: CreateProjectPayload = {
    name: wizardState.value.projectName,
    description: wizardState.value.projectDescription,
    problemStatement: wizardState.value.problemStatement,
    coreFeatures: splitLines(wizardState.value.coreFeatures),
    niceToHaveFeatures: splitLines(wizardState.value.niceToHaveFeatures),
    outOfScopeItems: splitLines(wizardState.value.outOfScopeItems),
    frontend: wizardState.value.frontend,
    backend: wizardState.value.backend,
    database: wizardState.value.database,
    architecture: wizardState.value.architecture,
    sprintCount: wizardState.value.sprintCount,
    velocityEstimate: wizardState.value.velocityEstimate,
  }

  try {
    await api.post('/projects', payload)
    await router.push({ name: 'dashboard' })
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : 'Failed to create project.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-white flex flex-col">
    <!-- Page header -->
    <div class="px-6 py-5 border-b border-slate-800">
      <h1 class="text-xl font-semibold text-white">New Project Wizard</h1>
      <p class="text-sm text-slate-400 mt-0.5">Set up your project step by step</p>
    </div>

    <!-- Step indicator -->
    <div class="px-6 py-4 border-b border-slate-800 overflow-x-auto">
      <ol class="flex items-center gap-0 min-w-max">
        <li
          v-for="(step, idx) in STEPS"
          :key="step.number"
          class="flex items-center"
        >
          <div class="flex flex-col items-center gap-1">
            <div
              class="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors"
              :class="stepStateClass(step)"
            >
              <span v-if="step.number < currentStep">&#10003;</span>
              <span v-else>{{ step.number }}</span>
            </div>
            <span class="text-xs transition-colors" :class="stepLabelClass(step)">
              {{ step.label }}
            </span>
          </div>
          <!-- Connector line -->
          <div
            v-if="idx < STEPS.length - 1"
            class="h-px w-10 mx-1 mb-4 transition-colors"
            :class="step.number < currentStep ? 'bg-blue-500' : 'bg-slate-700'"
          />
        </li>
      </ol>
    </div>

    <!-- Step content -->
    <div class="flex-1 flex items-start justify-center px-4 py-8">
      <div class="w-full max-w-2xl space-y-6">

        <!-- Step 1: Vision -->
        <div v-if="currentStep === 1" class="space-y-4">
          <h2 class="text-lg font-semibold">Project Vision</h2>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">Project Name</label>
            <input
              v-model="wizardState.projectName"
              type="text"
              placeholder="e.g. Customer Portal Redesign"
              class="w-full rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
            <textarea
              v-model="wizardState.projectDescription"
              rows="3"
              placeholder="Brief description of the project…"
              class="w-full rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">Problem Statement</label>
            <textarea
              v-model="wizardState.problemStatement"
              rows="4"
              placeholder="What problem does this project solve?"
              class="w-full rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        <!-- Step 2: Scope -->
        <div v-else-if="currentStep === 2" class="space-y-4">
          <h2 class="text-lg font-semibold">Project Scope</h2>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">
              Core Features <span class="text-slate-500">(one per line)</span>
            </label>
            <textarea
              v-model="wizardState.coreFeatures"
              rows="5"
              placeholder="User authentication&#10;Dashboard&#10;Data export"
              class="w-full rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">
              Nice-to-Have Features <span class="text-slate-500">(one per line)</span>
            </label>
            <textarea
              v-model="wizardState.niceToHaveFeatures"
              rows="3"
              placeholder="Dark mode&#10;Mobile app"
              class="w-full rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">
              Out of Scope <span class="text-slate-500">(one per line)</span>
            </label>
            <textarea
              v-model="wizardState.outOfScopeItems"
              rows="3"
              placeholder="Legacy system migration&#10;Internationalization"
              class="w-full rounded-md bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono"
            />
          </div>
        </div>

        <!-- Step 3: Tech Stack -->
        <div v-else-if="currentStep === 3" class="space-y-6">
          <h2 class="text-lg font-semibold">Tech Stack</h2>

          <!-- Frontend -->
          <fieldset>
            <legend class="block text-sm font-medium text-slate-300 mb-2">Frontend</legend>
            <div class="flex gap-3 flex-wrap">
              <label
                v-for="option in ['Vue', 'React', 'None'] as FrontendChoice[]"
                :key="option"
                class="flex items-center gap-2 cursor-pointer rounded-md border px-4 py-2.5 text-sm transition-colors"
                :class="
                  wizardState.frontend === option
                    ? 'border-blue-500 bg-blue-900/30 text-white'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500'
                "
              >
                <input
                  type="radio"
                  :value="option"
                  v-model="wizardState.frontend"
                  class="sr-only"
                />
                {{ option }}
              </label>
            </div>
          </fieldset>

          <!-- Backend -->
          <fieldset>
            <legend class="block text-sm font-medium text-slate-300 mb-2">Backend</legend>
            <div class="flex gap-3 flex-wrap">
              <label
                v-for="option in ['Fastify', 'Express', 'None'] as BackendChoice[]"
                :key="option"
                class="flex items-center gap-2 cursor-pointer rounded-md border px-4 py-2.5 text-sm transition-colors"
                :class="
                  wizardState.backend === option
                    ? 'border-blue-500 bg-blue-900/30 text-white'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500'
                "
              >
                <input
                  type="radio"
                  :value="option"
                  v-model="wizardState.backend"
                  class="sr-only"
                />
                {{ option }}
              </label>
            </div>
          </fieldset>

          <!-- Database -->
          <fieldset>
            <legend class="block text-sm font-medium text-slate-300 mb-2">Database</legend>
            <div class="flex gap-3 flex-wrap">
              <label
                v-for="option in ['SQLite', 'PostgreSQL', 'None'] as DatabaseChoice[]"
                :key="option"
                class="flex items-center gap-2 cursor-pointer rounded-md border px-4 py-2.5 text-sm transition-colors"
                :class="
                  wizardState.database === option
                    ? 'border-blue-500 bg-blue-900/30 text-white'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500'
                "
              >
                <input
                  type="radio"
                  :value="option"
                  v-model="wizardState.database"
                  class="sr-only"
                />
                {{ option }}
              </label>
            </div>
          </fieldset>
        </div>

        <!-- Step 4: Architecture -->
        <div v-else-if="currentStep === 4" class="space-y-4">
          <h2 class="text-lg font-semibold">Architecture Style</h2>

          <fieldset>
            <legend class="sr-only">Architecture</legend>
            <div class="space-y-3">
              <label
                v-for="option in ['Monolith', 'Modular Monolith', 'Microservices'] as ArchitectureChoice[]"
                :key="option"
                class="flex items-start gap-3 cursor-pointer rounded-lg border px-4 py-4 transition-colors"
                :class="
                  wizardState.architecture === option
                    ? 'border-blue-500 bg-blue-900/30'
                    : 'border-slate-700 bg-slate-800 hover:border-slate-500'
                "
              >
                <input
                  type="radio"
                  :value="option"
                  v-model="wizardState.architecture"
                  class="mt-0.5 accent-blue-500"
                />
                <div>
                  <div class="text-sm font-medium text-white">{{ option }}</div>
                  <div class="text-xs text-slate-400 mt-0.5">
                    <template v-if="option === 'Monolith'">Single deployable unit. Simplest to start with.</template>
                    <template v-else-if="option === 'Modular Monolith'">Structured modules with clear boundaries, still one deployment.</template>
                    <template v-else>Independent services. Maximum scalability, highest complexity.</template>
                  </div>
                </div>
              </label>
            </div>
          </fieldset>
        </div>

        <!-- Step 5: WBS Preview -->
        <div v-else-if="currentStep === 5" class="space-y-4">
          <h2 class="text-lg font-semibold">Work Breakdown Structure</h2>
          <p class="text-sm text-slate-400">
            Generated from your core features. This is a read-only preview.
          </p>
          <pre
            class="bg-slate-900 border border-slate-700 rounded-md text-xs text-slate-300 p-4 overflow-x-auto leading-relaxed whitespace-pre-wrap"
          >{{ wbsTree.join('\n') }}</pre>
        </div>

        <!-- Step 6: Sprint Plan -->
        <div v-else-if="currentStep === 6" class="space-y-4">
          <h2 class="text-lg font-semibold">Sprint Plan</h2>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1.5">Sprint Count</label>
              <input
                v-model.number="wizardState.sprintCount"
                type="number"
                min="1"
                max="24"
                class="w-full rounded-md bg-slate-800 border border-slate-700 text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-slate-300 mb-1.5">
                Velocity (story pts / sprint)
              </label>
              <input
                v-model.number="wizardState.velocityEstimate"
                type="number"
                min="1"
                class="w-full rounded-md bg-slate-800 border border-slate-700 text-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <h3 class="text-sm font-medium text-slate-300 mb-2">Allocation Preview</h3>
            <pre
              class="bg-slate-900 border border-slate-700 rounded-md text-xs text-slate-300 p-4 overflow-x-auto leading-relaxed whitespace-pre-wrap"
            >{{ sprintAllocation.join('\n') }}</pre>
          </div>
        </div>

        <!-- Step 7: Risk Assessment -->
        <div v-else-if="currentStep === 7" class="space-y-4">
          <h2 class="text-lg font-semibold">Risk Assessment</h2>
          <p class="text-sm text-slate-400">Identified risks based on your project configuration.</p>

          <div class="grid grid-cols-1 gap-3">
            <div
              v-for="risk in RISK_CARDS"
              :key="risk.label"
              class="rounded-lg border p-4"
              :class="riskCardBorderClass(risk.severity)"
            >
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-semibold text-white">{{ risk.label }} Risk</span>
                <span
                  class="inline-flex items-center rounded px-2 py-0.5 text-xs font-bold uppercase"
                  :class="riskSeverityClass(risk.severity)"
                >
                  {{ risk.severity }}
                </span>
              </div>
              <p class="text-sm text-slate-300">{{ risk.description }}</p>
            </div>
          </div>
        </div>

        <!-- Step 8: Generate -->
        <div v-else-if="currentStep === 8" class="space-y-5">
          <h2 class="text-lg font-semibold">Review &amp; Create</h2>

          <div class="rounded-lg border border-slate-700 bg-slate-800 divide-y divide-slate-700">
            <div class="px-4 py-3">
              <div class="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Project Name</div>
              <div class="text-sm text-white">{{ wizardState.projectName || '—' }}</div>
            </div>
            <div class="px-4 py-3">
              <div class="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Description</div>
              <div class="text-sm text-white">{{ wizardState.projectDescription || '—' }}</div>
            </div>
            <div class="px-4 py-3">
              <div class="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Problem Statement</div>
              <div class="text-sm text-white">{{ wizardState.problemStatement || '—' }}</div>
            </div>
            <div class="px-4 py-3">
              <div class="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Tech Stack</div>
              <div class="text-sm text-white">
                {{ wizardState.frontend }} / {{ wizardState.backend }} / {{ wizardState.database }}
              </div>
            </div>
            <div class="px-4 py-3">
              <div class="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Architecture</div>
              <div class="text-sm text-white">{{ wizardState.architecture }}</div>
            </div>
            <div class="px-4 py-3">
              <div class="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Sprint Plan</div>
              <div class="text-sm text-white">
                {{ wizardState.sprintCount }} sprints &times; {{ wizardState.velocityEstimate }} pts/sprint
              </div>
            </div>
          </div>

          <!-- Submit error -->
          <div
            v-if="submitError"
            class="rounded-md bg-red-900/40 border border-red-800 text-red-400 text-sm px-4 py-3"
            role="alert"
          >
            {{ submitError }}
          </div>
        </div>

      </div>
    </div>

    <!-- Navigation footer -->
    <div class="px-6 py-4 border-t border-slate-800 flex items-center justify-between">
      <button
        type="button"
        class="rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white text-sm px-4 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="isFirstStep"
        @click="goBack"
      >
        Back
      </button>

      <!-- Next or Create -->
      <button
        v-if="!isLastStep"
        type="button"
        class="rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 transition-colors"
        @click="goNext"
      >
        Next
      </button>

      <button
        v-else
        type="button"
        class="rounded-md bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 transition-colors"
        :disabled="isSubmitting"
        @click="createProject"
      >
        <span v-if="isSubmitting">Creating…</span>
        <span v-else>Create Project</span>
      </button>
    </div>
  </div>
</template>
