import { ref, onUnmounted } from 'vue'
import type { Ref } from 'vue'

type EventHandler = (data: unknown) => void

const CRITICAL_EVENTS = new Set(['agent:failed', 'budget:exceeded'])
const RECONNECT_DELAY_MS = 3000

/**
 * SSE connection composable. Connects to /api/v1/events with JWT auth,
 * auto-reconnects on disconnect, and triggers browser Notifications for
 * critical events.
 */
export function useSse(): {
  isConnected: Ref<boolean>
  onEvent: (type: string, handler: EventHandler) => void
} {
  const isConnected = ref(false)
  const handlers = new Map<string, EventHandler[]>()
  let eventSource: EventSource | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let isManuallyClosed = false

  function onEvent(type: string, handler: EventHandler): void {
    const existing = handlers.get(type) ?? []
    existing.push(handler)
    handlers.set(type, existing)
  }

  function dispatchEvent(type: string, data: unknown): void {
    const eventHandlers = handlers.get(type)
    if (eventHandlers) {
      for (const handler of eventHandlers) {
        handler(data)
      }
    }

    // Trigger browser notification for critical events
    if (CRITICAL_EVENTS.has(type) && 'Notification' in window) {
      void requestNotification(type, data)
    }
  }

  async function requestNotification(type: string, data: unknown): Promise<void> {
    if (Notification.permission === 'default') {
      await Notification.requestPermission()
    }

    if (Notification.permission === 'granted') {
      const body = typeof data === 'object' && data !== null
        ? JSON.stringify(data)
        : String(data)
      new Notification(`MerlinsA-IDE: ${type}`, { body, icon: '/icon-192.png' })
    }
  }

  function connect(): void {
    const token = localStorage.getItem('jwt')
    if (!token) return

    const url = `/api/v1/events?token=${encodeURIComponent(token)}`
    eventSource = new EventSource(url)

    eventSource.onopen = () => {
      isConnected.value = true
    }

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as { type?: string; data?: unknown }
        const type = parsed.type ?? 'message'
        dispatchEvent(type, parsed.data ?? parsed)
      } catch {
        dispatchEvent('message', event.data)
      }
    }

    eventSource.onerror = () => {
      isConnected.value = false
      eventSource?.close()
      eventSource = null

      if (!isManuallyClosed) {
        reconnectTimer = setTimeout(() => {
          connect()
        }, RECONNECT_DELAY_MS)
      }
    }

    // Handle named event types
    const namedEvents = [
      'agent:started',
      'agent:completed',
      'agent:failed',
      'task:updated',
      'sprint:updated',
      'budget:exceeded',
      'token:usage',
    ]

    for (const eventType of namedEvents) {
      eventSource.addEventListener(eventType, (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string) as unknown
          dispatchEvent(eventType, data)
        } catch {
          dispatchEvent(eventType, event.data)
        }
      })
    }
  }

  connect()

  onUnmounted(() => {
    isManuallyClosed = true
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
    }
    eventSource?.close()
    eventSource = null
    isConnected.value = false
  })

  return { isConnected, onEvent }
}
