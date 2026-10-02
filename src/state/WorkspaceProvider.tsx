import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth/context'
import { emptyWorkspace } from '../data/seed'
import { reducer, WorkspaceContext } from './store'
import type { Dataset, Project, Workspace } from './types'

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, csrfToken, refresh, updateDisplayName } = useAuth()
  const [state, dispatch] = useReducer(reducer, {
    ...emptyWorkspace(),
    displayName: user?.displayName ?? '',
  })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const active = useRef(false)
  const controllers = useRef(new Set<AbortController>())

  async function request<T>(path: string, init: RequestInit = {}, externalSignal?: AbortSignal) {
    const controller = new AbortController()
    controllers.current.add(controller)
    if (externalSignal?.aborted) controller.abort()
    const cancel = () => controller.abort()
    externalSignal?.addEventListener('abort', cancel, { once: true })
    try {
      return await api<T>(path, {
        ...init,
        signal: controller.signal,
        headers: {
          ...(csrfToken && init.method && init.method !== 'GET'
            ? { 'X-CSRF-Token': csrfToken }
            : {}),
          ...init.headers,
        },
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) void refresh()
      throw error
    } finally {
      externalSignal?.removeEventListener('abort', cancel)
      controllers.current.delete(controller)
    }
  }

  useEffect(() => {
    active.current = true
    const controller = new AbortController()
    const pending = controllers.current
    pending.add(controller)
    void api<Workspace>('workspace', { signal: controller.signal })
      .then((workspace) => {
        if (!active.current) return
        dispatch({ type: 'workspace/replace', workspace })
        setLoading(false)
        setLoadError('')
      })
      .catch((error) => {
        if (!active.current || controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 401) void refresh()
        setLoadError(error instanceof Error ? error.message : 'Unable to load your workspace.')
        setLoading(false)
      })
      .finally(() => pending.delete(controller))
    return () => {
      active.current = false
      for (const pendingRequest of pending) pendingRequest.abort()
      pending.clear()
    }
  }, [reload, user?.id, refresh])

  async function createProject(name: string, description: string): Promise<Project> {
    const project = await request<Project>('projects', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    })
    if (active.current) dispatch({ type: 'project/add', project })
    return project
  }

  async function deleteProject(id: string) {
    await request<void>(`projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (active.current) dispatch({ type: 'project/delete', id })
  }

  async function uploadDataset(
    file: File,
    sheetName?: string,
    signal?: AbortSignal,
  ): Promise<Dataset> {
    const form = new FormData()
    form.append('file', file)
    if (sheetName) form.append('sheet_name', sheetName)
    const dataset = await request<Dataset>('datasets', { method: 'POST', body: form }, signal)
    if (active.current) dispatch({ type: 'dataset/add', dataset })
    return dataset
  }

  async function assignDataset(id: string, projectId: string | null) {
    await request<Dataset>(`datasets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ projectId }),
    })
    if (active.current) dispatch({ type: 'dataset/assign', id, projectId })
  }

  async function deleteDataset(id: string) {
    await request<void>(`datasets/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (active.current) dispatch({ type: 'dataset/delete', id })
  }

  async function updateName(name: string) {
    await updateDisplayName(name)
    if (active.current) dispatch({ type: 'profile', name })
  }

  async function resetWorkspace() {
    await request<void>('workspace', { method: 'DELETE' })
    if (active.current)
      dispatch({
        type: 'workspace/replace',
        workspace: { version: 2, displayName: state.displayName, projects: [], datasets: [] },
      })
  }

  if (loading || loadError) {
    return (
      <main className="workspace-loading" id="main">
        <span className="wordmark">MindMesh</span>
        <h1>{loadError ? 'Could not load your workspace.' : 'Opening your workspace.'}</h1>
        {loadError && (
          <p className="error" role="alert">
            {loadError}
          </p>
        )}
        {loadError && (
          <button
            className="button primary"
            onClick={() => {
              setLoading(true)
              setLoadError('')
              setReload((value) => value + 1)
            }}
          >
            Try again
          </button>
        )}
      </main>
    )
  }

  return (
    <WorkspaceContext.Provider
      value={{
        state,
        createProject,
        deleteProject,
        uploadDataset,
        assignDataset,
        deleteDataset,
        updateName,
        resetWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}
