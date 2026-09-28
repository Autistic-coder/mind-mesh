import type { Cell, Column, Dataset } from '../state/types'

export const LIMITS = { bytes: 5 * 1024 * 1024, rows: 20_000, columns: 100, preview: 25 }

export function summarizeRows(name: string, raw: unknown[][]): Dataset {
  const rows = raw.filter((row) =>
    row.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== ''),
  )
  if (rows.length < 2) throw new Error('Include a header row and at least one data row.')
  const headers = rows[0].map((value) => String(value ?? '').trim())
  if (headers.length > LIMITS.columns) throw new Error('Use a dataset with 100 columns or fewer.')
  if (headers.some((header) => !header)) throw new Error('Every column needs a non-empty header.')
  if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length)
    throw new Error('Column headers must be unique (ignoring case).')
  const data = rows.slice(1)
  if (data.length > LIMITS.rows) throw new Error('Use a dataset with 20,000 rows or fewer.')
  if (data.some((row) => row.length !== headers.length))
    throw new Error('Each row must have the same number of cells as the header.')
  const normalized: Cell[][] = data.map((row) =>
    row.map((cell) => (typeof cell === 'number' ? cell : String(cell ?? '').trim())),
  )
  const columns: Column[] = headers.map((header, index) => {
    const values = normalized.map((row) => row[index]).filter((value) => value !== '')
    const unique = [...new Set(values.map(String))]
    const numeric = values.length > 0 && values.every((value) => Number.isFinite(Number(value)))
    return {
      name: header,
      type: numeric ? 'number' : unique.length <= 30 ? 'category' : 'text',
      missing: data.length - values.length,
      uniqueCount: unique.length,
      values: unique.slice(0, 30),
    }
  })
  return {
    id: crypto.randomUUID(),
    name,
    source: 'uploaded',
    projectId: null,
    columns,
    rowCount: data.length,
    preview: normalized.slice(0, LIMITS.preview),
    createdAt: new Date().toISOString(),
  }
}
