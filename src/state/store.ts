import { createContext, useContext, type Dispatch } from 'react'
import { seedWorkspace } from '../data/seed'
import type { Action, Workspace } from './types'

export function reducer(state: Workspace, action: Action): Workspace {
  switch (action.type) {
    case 'project/add':
      return { ...state, projects: [...state.projects, action.project] }
    case 'project/delete':
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.id),
        models: state.models.filter((m) => m.projectId !== action.id),
        datasets: state.datasets.map((d) =>
          d.projectId === action.id ? { ...d, projectId: null } : d,
        ),
      }
    case 'dataset/add':
      return { ...state, datasets: [...state.datasets, action.dataset] }
    case 'dataset/delete':
      return { ...state, datasets: state.datasets.filter((d) => d.id !== action.id) }
    case 'dataset/assign':
      return {
        ...state,
        datasets: state.datasets.map((d) =>
          d.id === action.id ? { ...d, projectId: action.projectId } : d,
        ),
      }
    case 'models/add':
      return {
        ...state,
        models: [...state.models, ...action.models],
        projects: state.projects.map((p) =>
          action.models.some((m) => m.projectId === p.id)
            ? { ...p, updatedAt: new Date().toISOString() }
            : p,
        ),
      }
    case 'messages/add':
      return { ...state, messages: [...state.messages, ...action.messages].slice(-100) }
    case 'messages/clear':
      return { ...state, messages: [] }
    case 'profile':
      return { ...state, displayName: action.name }
    case 'reset':
      return seedWorkspace()
  }
}

export const WorkspaceContext = createContext<{
  state: Workspace
  dispatch: Dispatch<Action>
  warning: string
} | null>(null)
export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('Workspace provider is required')
  return context
}
