import type { Dataset, Model, Task } from '../state/types'

export function trainingError(dataset: Dataset | undefined, targetName: string, task: Task): string | null {
  if (!dataset) return 'Choose a dataset assigned to this project.'
  const target = dataset.columns.find(column => column.name === targetName)
  if (!target) return 'Choose a target column.'
  if (dataset.columns.length < 2) return 'A dataset needs a target and at least one feature column.'
  if (target.uniqueCount < 2) return 'The target must contain at least two distinct non-empty values.'
  if (task === 'regression' && target.type !== 'number') return 'Regression needs a numeric target column.'
  return null
}

export function sampleModels(dataset: Dataset, projectId: string, targetName: string, task: Task): Model[] {
  const problem = trainingError(dataset, targetName, task)
  if (problem) throw new Error(problem)
  const names = task === 'classification' ? ['Random forest', 'Logistic regression'] : ['Gradient boosting', 'Linear regression']
  return names.map<Model>((name, index) => ({
    id: crypto.randomUUID(), name, projectId, datasetId: dataset.id, datasetName: dataset.name,
    task, target: structuredClone(dataset.columns.find(column => column.name === targetName)!),
    features: structuredClone(dataset.columns.filter(column => column.name !== targetName)),
    metrics: sampleMetrics(task, index),
    demo: true, createdAt: new Date().toISOString(),
  }))
}

function sampleMetrics(task: Task, index: number): Record<string, number> {
  if (task === 'classification') return { Accuracy: .89 - index * .04, F1: .87 - index * .05 }
  return { MAE: 145 + index * 34, RMSE: 198 + index * 45, 'R²': .86 - index * .06 }
}

export function formatMetric(name: string, value: number) { return name === 'Accuracy' || name === 'F1' ? `${(value * 100).toFixed(1)}%` : value.toLocaleString(undefined, { maximumFractionDigits: 2 }) }
