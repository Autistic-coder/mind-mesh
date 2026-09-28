export type Task = 'classification' | 'regression'
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
  source: 'synthetic' | 'uploaded'
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
  demo: boolean
  updatedAt: string
}
export interface Model {
  id: string
  name: string
  projectId: string
  datasetId: string
  datasetName: string
  task: Task
  target: Column
  features: Column[]
  metrics: Record<string, number>
  demo: true
  createdAt: string
}
export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  demo: boolean
  createdAt: string
}
export interface Workspace {
  version: 1
  displayName: string
  projects: Project[]
  datasets: Dataset[]
  models: Model[]
  messages: Message[]
}
export type Action =
  | { type: 'project/add'; project: Project }
  | { type: 'project/delete'; id: string }
  | { type: 'dataset/add'; dataset: Dataset }
  | { type: 'dataset/delete'; id: string }
  | { type: 'dataset/assign'; id: string; projectId: string | null }
  | { type: 'models/add'; models: Model[] }
  | { type: 'messages/add'; messages: Message[] }
  | { type: 'messages/clear' }
  | { type: 'profile'; name: string }
  | { type: 'reset' }
