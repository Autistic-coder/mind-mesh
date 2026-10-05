export type Task = 'classification' | 'regression'

export interface SchemaColumn {
  name: string
  type: 'number' | 'category' | 'text' | 'date' | 'boolean' | 'mixed'
  missing: number
  uniqueCount: number
  uniqueCountCapped?: boolean
  values: string[]
  warnings: string[]
}

export interface DatasetSchema {
  datasetId: string
  name: string
  rowCount: number
  columns: SchemaColumn[]
  supportedFeatureTypes: string[]
}

export interface RunConfig {
  datasetId: string
  task: Task
  target: string
  features: string[]
  algorithms: string[]
  testSize: number
  randomSeed: number
  missingHandling?: Record<string, string>
}

export interface ModelResult {
  modelId: string
  algorithm: string
  trainRows: number
  testRows: number
  targetRowsOmitted: number
  metrics: Record<string, number | null>
  averaging?: string
  classLabels?: string[]
  confusionMatrix?: number[][]
  trainClassDistribution?: Record<string, number>
  testClassDistribution?: Record<string, number>
  actualVsPredicted?: Array<{ actual: number; predicted: number }>
  featureImportance: Array<{ feature: string; importance: number }>
  importanceMethod: string
}

export interface TrainingRun {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'interrupted'
  createdAt: string
  datasetId: string
  projectId: string | null
  config: RunConfig
  result: null | {
    models?: ModelResult[]
    error?: string
    completedAt?: string
    evaluationNotice?: string
  }
}

export interface SavedModel {
  id: string
  runId: string
  createdAt: string
  task: Task
  algorithm: string
  target: string
  features: string[]
  numericFeatures: string[]
  categoricalFeatures: string[]
  selected: boolean
  versions: Record<string, string>
}

export interface PredictionHistory {
  id: string
  modelId: string
  input: unknown
  output: unknown
  createdAt: string
}
