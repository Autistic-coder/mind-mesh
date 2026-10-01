export type Cell = string | number

export interface Column {
  name: string
  type: 'number' | 'category' | 'text'
  missing: number
  uniqueCount: number
  values: string[]
}

export interface Dataset {
  id: string
  name: string
  projectId: string | null
  columns: Column[]
  rowCount: number
  preview: Cell[][]
  createdAt: string
}

export interface Project {
  id: string
  name: string
  description: string
  updatedAt: string
}

export interface Workspace {
  version: 2
  displayName: string
  projects: Project[]
  datasets: Dataset[]
}

export type Action =
  | { type: 'project/add'; project: Project }
  | { type: 'project/delete'; id: string }
  | { type: 'dataset/add'; dataset: Dataset }
  | { type: 'dataset/delete'; id: string }
  | { type: 'dataset/assign'; id: string; projectId: string | null }
  | { type: 'profile'; name: string }
  | { type: 'reset' }
