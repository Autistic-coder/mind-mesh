import type { Column, Dataset, Project, Workspace } from './types'
import { emptyWorkspace } from '../data/seed'

export const STORAGE_KEY = 'mindmesh.workspace.v1'
export const STORAGE_BUDGET = 3 * 1024 * 1024
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const string = (value: unknown): value is string => typeof value === 'string'
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(string)
const integer = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0
const timestamp = (value: unknown) => string(value) && Number.isFinite(Date.parse(value))
const column = (value: unknown): value is Column =>
  record(value) &&
  string(value.name) &&
  ['number', 'category', 'text'].includes(String(value.type)) &&
  integer(value.missing) &&
  integer(value.uniqueCount) &&
  strings(value.values)

function validProject(value: unknown): value is Project {
  return (
    record(value) &&
    string(value.id) &&
    string(value.name) &&
    string(value.description) &&
    timestamp(value.updatedAt)
  )
}

function validDataset(value: unknown, projects: Project[]): value is Dataset {
  return (
    record(value) &&
    string(value.id) &&
    string(value.name) &&
    (value.projectId === null || projects.some((project) => project.id === value.projectId)) &&
    integer(value.rowCount) &&
    value.rowCount > 0 &&
    Array.isArray(value.columns) &&
    value.columns.length > 0 &&
    value.columns.every(column) &&
    Array.isArray(value.preview) &&
    value.preview.length <= 25 &&
    value.preview.every(
      (row: unknown) =>
        Array.isArray(row) &&
        row.length === (value.columns as unknown[]).length &&
        row.every((cell) => string(cell) || (typeof cell === 'number' && Number.isFinite(cell))),
    ) &&
    timestamp(value.createdAt)
  )
}

function uniqueIds(items: { id: string }[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length
}

export function validWorkspace(value: unknown): value is Workspace {
  if (
    !record(value) ||
    value.version !== 2 ||
    !string(value.displayName) ||
    !value.displayName.trim() ||
    !Array.isArray(value.projects) ||
    !value.projects.every(validProject) ||
    !Array.isArray(value.datasets)
  )
    return false
  const projects = value.projects as Project[]
  const datasets = value.datasets as Dataset[]
  return (
    datasets.every((dataset) => validDataset(dataset, projects)) &&
    uniqueIds(projects) &&
    uniqueIds(datasets)
  )
}

function migrateLegacy(value: unknown): Workspace {
  if (
    !record(value) ||
    value.version !== 1 ||
    !string(value.displayName) ||
    !value.displayName.trim() ||
    !Array.isArray(value.projects) ||
    !Array.isArray(value.datasets) ||
    !value.projects.every(
      (project) => record(project) && typeof project.demo === 'boolean' && validProject(project),
    ) ||
    !value.datasets.every(
      (dataset) =>
        record(dataset) &&
        ['uploaded', 'synthetic'].includes(String(dataset.source)) &&
        validDataset(dataset, value.projects as Project[]),
    )
  )
    throw new Error('Invalid legacy workspace')

  const projects: Project[] = value.projects
    .filter((project: Record<string, unknown>) => project.demo === false)
    .map((project: Record<string, unknown>) => ({
      id: project.id as string,
      name: project.name as string,
      description: project.description as string,
      updatedAt: project.updatedAt as string,
    }))
  const datasets: Dataset[] = value.datasets
    .filter((dataset: Record<string, unknown>) => dataset.source === 'uploaded')
    .map((dataset: Record<string, unknown>) => ({
      id: dataset.id as string,
      name: dataset.name as string,
      projectId: projects.some((project) => project.id === dataset.projectId)
        ? (dataset.projectId as string)
        : null,
      columns: dataset.columns as Column[],
      rowCount: dataset.rowCount as number,
      preview: dataset.preview as Dataset['preview'],
      createdAt: dataset.createdAt as string,
    }))
  const migrated: Workspace = { version: 2, displayName: value.displayName, projects, datasets }
  if (!validWorkspace(migrated)) throw new Error('Invalid migrated workspace')
  return migrated
}

export function loadWorkspace(storage: Pick<Storage, 'getItem'>): {
  state: Workspace
  warning: string
  blocked: boolean
} {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) return { state: emptyWorkspace(), warning: '', blocked: false }
    const parsed: unknown = JSON.parse(raw)
    const state = record(parsed) && parsed.version === 1 ? migrateLegacy(parsed) : parsed
    if (!validWorkspace(state)) throw new Error('Invalid workspace')
    return { state, warning: '', blocked: false }
  } catch {
    return {
      state: emptyWorkspace(),
      warning:
        'Saved workspace could not be read. Reset the local workspace to replace the saved data and enable persistence.',
      blocked: true,
    }
  }
}

export function saveWorkspace(storage: Pick<Storage, 'setItem'>, state: Workspace): string {
  try {
    const serialized = JSON.stringify(state)
    if (serialized.length * 2 > STORAGE_BUDGET)
      return 'Storage budget reached. Current changes are session-only. Remove some imported datasets to save again.'
    storage.setItem(STORAGE_KEY, serialized)
    return ''
  } catch {
    return 'Browser storage is unavailable or full. Current changes are session-only; they may be lost on refresh.'
  }
}
