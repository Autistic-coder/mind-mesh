import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, ApiError } from '../api'
import { AuthContext, type Account, type AuthStatus } from './context'

interface SessionResult {
  user: Account
  csrfToken: string
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null)
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const epoch = useRef(0)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const current = ++epoch.current
    try {
      const session = await api<SessionResult>('auth/me', { signal })
      if (current !== epoch.current) return
      setUser(session.user)
      setCsrfToken(session.csrfToken)
      setStatus('authenticated')
    } catch (error) {
      if (current !== epoch.current || signal?.aborted) return
      setUser(null)
      setCsrfToken(null)
      setStatus(
        error instanceof ApiError && (error.status === 0 || error.status >= 500)
          ? 'unavailable'
          : 'anonymous',
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
    const session = await api<SessionResult>(`auth/${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (current !== epoch.current) throw new Error('This sign-in attempt was cancelled.')
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
    const current = ++epoch.current
    setStatus('loading')
    try {
      await api<void>('auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } })
    } catch (error) {
      if (current === epoch.current) setStatus('authenticated')
      throw error
    }
    if (current !== epoch.current) return
    setUser(null)
    setCsrfToken(null)
    setStatus('anonymous')
  }

  async function updateDisplayName(name: string) {
    if (!csrfToken) throw new Error('Your session has ended. Refresh the page and try again.')
    const current = epoch.current
    const updated = await api<Account>('auth/profile', {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ display_name: name }),
    })
    if (current === epoch.current) setUser(updated)
  }

  return (
    <AuthContext.Provider
      value={{ user, csrfToken, status, signIn, register, signOut, refresh, updateDisplayName }}
    >
      {children}
    </AuthContext.Provider>
  )
}
