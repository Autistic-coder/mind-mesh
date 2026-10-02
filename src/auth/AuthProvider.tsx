import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AuthContext, type Account, type AuthStatus } from './context'

interface SessionResult {
  user: Account
  csrfToken: string
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/auth/${path}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('The server is unavailable. Please try again in a moment.')
  }
  if (!response.ok) {
    if (response.status >= 500)
      throw new Error('The server is temporarily unavailable. Please try again in a moment.')
    const body = await response.json().catch(() => null)
    const detail = body?.detail
    throw new Error(
      typeof detail === 'string'
        ? detail
        : response.status === 422
          ? 'Check the details you entered and try again.'
          : 'Something went wrong. Please try again.',
    )
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null)
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const epoch = useRef(0)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const current = ++epoch.current
    try {
      const session = await api<SessionResult>('me', { signal })
      if (current !== epoch.current) return
      setUser(session.user)
      setCsrfToken(session.csrfToken)
      setStatus('authenticated')
    } catch (error) {
      if (current !== epoch.current || signal?.aborted) return
      setUser(null)
      setCsrfToken(null)
      setStatus(
        error instanceof Error && error.message.includes('server') ? 'unavailable' : 'anonymous',
      )
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  async function enter(path: 'login' | 'register', body: object) {
    const current = ++epoch.current
    const session = await api<SessionResult>(path, { method: 'POST', body: JSON.stringify(body) })
    if (current !== epoch.current) return
    setUser(session.user)
    setCsrfToken(session.csrfToken)
    setStatus('authenticated')
  }

  async function signIn(email: string, password: string) {
    await enter('login', { email: email.trim(), password })
  }

  async function register(
    displayName: string,
    email: string,
    password: string,
    confirmation: string,
  ) {
    await enter('register', {
      display_name: displayName.trim(),
      email: email.trim(),
      password,
      password_confirmation: confirmation,
    })
  }

  async function signOut() {
    if (!csrfToken) throw new Error('Your session has ended. Refresh the page and try again.')
    await api<void>('logout', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } })
    epoch.current++
    setUser(null)
    setCsrfToken(null)
    setStatus('anonymous')
  }

  return (
    <AuthContext.Provider value={{ user, csrfToken, status, signIn, register, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}
