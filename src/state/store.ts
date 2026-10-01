import { createContext, useContext, type Dispatch } from 'react'
import { emptyWorkspace } from '../data/seed'
import type { Action, Workspace } from './types'

export function reducer(state: Workspace, action: Action): Workspace {
  switch (action.type) {
    case 'project/add':
      return { ...state, projects: [...state.projects, action.project] }
    case 'project/delete':
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.id),
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
    case 'profile':
      return { ...state, displayName: action.name }
    case 'reset':
      return emptyWorkspace()
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
