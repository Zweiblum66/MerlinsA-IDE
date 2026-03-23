import { router } from '../router/index.js'

const API_BASE = '/api/v1'

interface ApiError {
  message: string
  statusCode: number
}

function getToken(): string | null {
  return localStorage.getItem('jwt')
}

function buildHeaders(extraHeaders?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  }

  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return headers
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    localStorage.removeItem('jwt')
    await router.push({ name: 'login' })
    throw { message: 'Unauthorized', statusCode: 401 } satisfies ApiError
  }

  if (!response.ok) {
    let message = `HTTP error ${response.status}`
    try {
      const body = (await response.json()) as { message?: string }
      if (body.message) message = body.message
    } catch {
      // ignore parse errors
    }
    throw { message, statusCode: response.status } satisfies ApiError
  }

  if (response.status === 204) {
    return undefined as unknown as T
  }

  return response.json() as Promise<T>
}

/**
 * Typed API client composable. Automatically injects JWT Authorization header
 * and redirects to /login on 401 responses.
 */
export function useApi(): {
  get: <T>(url: string) => Promise<T>
  post: <T>(url: string, body?: unknown) => Promise<T>
  patch: <T>(url: string, body?: unknown) => Promise<T>
  del: <T>(url: string) => Promise<T>
} {
  async function get<T>(url: string): Promise<T> {
    const response = await fetch(`${API_BASE}${url}`, {
      method: 'GET',
      headers: buildHeaders(),
    })
    return handleResponse<T>(response)
  }

  async function post<T>(url: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers: buildHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(response)
  }

  async function patch<T>(url: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${url}`, {
      method: 'PATCH',
      headers: buildHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(response)
  }

  async function del<T>(url: string): Promise<T> {
    const response = await fetch(`${API_BASE}${url}`, {
      method: 'DELETE',
      headers: buildHeaders(),
    })
    return handleResponse<T>(response)
  }

  return { get, post, patch, del }
}
