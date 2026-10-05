export type Cell = string | number

export interface Column {
  name: string
  type: 'number' | 'category' | 'text' | 'date' | 'boolean' | 'mixed'
  missing: number
  uniqueCount: number
  uniqueCountCapped?: boolean
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
  hasFile?: boolean
  storageStatus?: 'complete' | 'preview-only' | 'missing'
  originalFilename?: string | null
  fileFormat?: 'CSV' | 'XLSX' | null
  sizeBytes?: number | null
  sheetName?: string | null
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
  | { type: 'workspace/replace'; workspace: Workspace }
  | { type: 'project/add'; project: Project }
  | { type: 'project/delete'; id: string }
  | { type: 'dataset/add'; dataset: Dataset }
  | { type: 'dataset/delete'; id: string }
  | { type: 'dataset/assign'; id: string; projectId: string | null }
  | { type: 'profile'; name: string }
