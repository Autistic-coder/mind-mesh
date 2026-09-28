import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { loadWorkspace, saveWorkspace } from './persistence'
import { reducer, WorkspaceContext } from './store'
import { seedWorkspace } from '../data/seed'
import type { Action } from './types'

function initialize() {
  try { return loadWorkspace(window.localStorage) }
  catch { return { state: seedWorkspace(), warning: 'Browser storage is disabled. This workspace will only last for this session.', blocked: true } }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(initialize)
  const [state, rawDispatch] = useReducer(reducer, initial.state)
  const [warning, setWarning] = useState(initial.warning)
  const blocked = useRef(initial.blocked)
  const dispatch = (action: Action) => { if (action.type === 'reset') blocked.current = false; rawDispatch(action) }
  useEffect(() => {
    if (blocked.current) return
    try { setWarning(saveWorkspace(window.localStorage, state)) }
    catch { setWarning('Browser storage is unavailable. Changes are session-only.') }
  }, [state])
  return <WorkspaceContext.Provider value={{ state, dispatch, warning }}>{children}</WorkspaceContext.Provider>
}
