import type { Model } from '../state/types'

export function predictionErrors(model: Model, values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const feature of model.features) {
    const value = values[feature.name]?.trim() ?? ''
    if (!value) errors[feature.name] = `${feature.name} is required.`
    else if (feature.type === 'number' && !Number.isFinite(Number(value))) errors[feature.name] = 'Enter a valid, finite number.'
    else if (feature.type === 'category' && feature.values.length > 0 && !feature.values.includes(value)) errors[feature.name] = 'Choose one of the available categories.'
  }
  return errors
}

export function simulatePrediction(model: Model, values: Record<string, string>): string {
  if (Object.keys(predictionErrors(model, values)).length) throw new Error('Complete all feature fields with valid values.')
  const input = model.features.map(feature => values[feature.name].trim()).join('|')
  let hash = 0
  for (const char of input) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  if (model.task === 'classification') return model.target.values[hash % model.target.values.length] ?? 'Sample category'
  const examples = model.target.values.map(Number).filter(Number.isFinite)
  const min = examples.length ? Math.min(...examples) : 0
  const max = examples.length ? Math.max(...examples) : 100
  return (min + (max - min) * (hash % 1000) / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })
}
