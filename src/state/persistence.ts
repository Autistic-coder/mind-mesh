import type { Column, Workspace } from './types'
import { seedWorkspace } from '../data/seed'

export const STORAGE_KEY = 'mindmesh.workspace.v1'
export const STORAGE_BUDGET = 3 * 1024 * 1024
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const string = (value: unknown): value is string => typeof value === 'string'
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(string)
const integer = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0
const timestamp = (value: unknown) => string(value) && Number.isFinite(Date.parse(value))
const column = (value: unknown): value is Column => record(value) && string(value.name) && ['number', 'category', 'text'].includes(String(value.type)) && integer(value.missing) && integer(value.uniqueCount) && strings(value.values)

export function validWorkspace(value: unknown): value is Workspace {
  if (!record(value) || value.version !== 1 || !string(value.displayName) || !value.displayName.trim()) return false
  const { projects, datasets, models, messages } = value
  if (!Array.isArray(projects) || !projects.every(p => record(p) && string(p.id) && string(p.name) && string(p.description) && typeof p.demo === 'boolean' && timestamp(p.updatedAt))) return false
  if (!Array.isArray(datasets) || !datasets.every(d => record(d) && string(d.id) && string(d.name) && ['synthetic', 'uploaded'].includes(String(d.source)) && (d.projectId === null || projects.some(p => p.id === d.projectId)) && integer(d.rowCount) && d.rowCount > 0 && Array.isArray(d.columns) && d.columns.length > 0 && d.columns.every(column) && Array.isArray(d.preview) && d.preview.length <= 25 && d.preview.every((row: unknown) => Array.isArray(row) && row.length === (d.columns as unknown[]).length && row.every(cell => string(cell) || (typeof cell === 'number' && Number.isFinite(cell)))) && timestamp(d.createdAt))) return false
  if (!Array.isArray(models) || !models.every(m => record(m) && string(m.id) && string(m.name) && projects.some(p => p.id === m.projectId) && string(m.datasetId) && string(m.datasetName) && ['classification', 'regression'].includes(String(m.task)) && column(m.target) && Array.isArray(m.features) && m.features.every(column) && m.demo === true && timestamp(m.createdAt) && record(m.metrics) && (m.task === 'classification' ? ['Accuracy', 'F1'] : ['MAE', 'RMSE', 'R²']).every(key => typeof (m.metrics as Record<string, unknown>)[key] === 'number' && Number.isFinite((m.metrics as Record<string, number>)[key])))) return false
  if (!Array.isArray(messages) || messages.length > 100 || !messages.every(m => record(m) && string(m.id) && ['user', 'assistant'].includes(String(m.role)) && string(m.content) && typeof m.demo === 'boolean' && timestamp(m.createdAt))) return false
  return [projects, datasets, models, messages].every(items => new Set(items.map(item => item.id)).size === items.length)
}

export function loadWorkspace(storage: Pick<Storage, 'getItem'>): { state: Workspace; warning: string; blocked: boolean } {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) return { state: seedWorkspace(), warning: '', blocked: false }
    const state: unknown = JSON.parse(raw)
    if (!validWorkspace(state)) throw new Error('Invalid workspace')
    return { state, warning: '', blocked: false }
  } catch {
    return { state: seedWorkspace(), warning: 'Saved workspace could not be read. You can explore in this session. Reset the local workspace to replace the saved data and enable persistence.', blocked: true }
  }
}

export function saveWorkspace(storage: Pick<Storage, 'setItem'>, state: Workspace): string {
  try {
    const serialized = JSON.stringify(state)
    if (serialized.length * 2 > STORAGE_BUDGET) return 'Storage budget reached. Current changes are session-only. Remove some imported datasets or clear chat history to save again.'
    storage.setItem(STORAGE_KEY, serialized)
    return ''
  } catch { return 'Browser storage is unavailable or full. Current changes are session-only; they may be lost on refresh.' }
}
