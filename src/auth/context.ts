import { createContext, useContext } from 'react'

export interface Account {
  id: string
  displayName: string
  email: string
}

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'unavailable'

export interface AuthContextValue {
  user: Account | null
  csrfToken: string | null
  status: AuthStatus
  signIn: (email: string, password: string) => Promise<void>
  register: (
    displayName: string,
    email: string,
    password: string,
    confirmation: string,
  ) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('Auth provider is required')
  return context
}
