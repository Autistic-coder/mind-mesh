import type { Cell, Column, Dataset } from '../state/types'

export const LIMITS = {
  bytes: 25 * 1024 * 1024,
  rows: 200_000,
  columns: 10_000,
  cells: 10_000_000,
  preview: 25,
}

export function summarizeRows(name: string, raw: unknown[][]): Dataset {
  const rows = raw.filter((row) =>
    row.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== ''),
  )
  if (rows.length < 2) throw new Error('Include a header row and at least one data row.')
  const headers = rows[0].map((value) => String(value ?? '').trim())
  if (headers.length > LIMITS.columns)
    throw new Error('Use a dataset with 10,000 columns or fewer.')
  if (headers.some((header) => !header)) throw new Error('Every column needs a non-empty header.')
  if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length)
    throw new Error('Column headers must be unique (ignoring case).')
  const data = rows.slice(1)
  if (data.length > LIMITS.rows) throw new Error('Use a dataset with 200,000 rows or fewer.')
  if (data.length * headers.length > LIMITS.cells)
    throw new Error('This dataset has too many cells to review safely.')
  if (data.some((row) => row.length !== headers.length))
    throw new Error('Each row must have the same number of cells as the header.')
  const normalized: Cell[][] = []
  const columns: Column[] = headers.map((header, index) => {
    const unique = new Set<string>()
    let missing = 0
    let numeric = true
    let nonMissing = 0
    for (let rowIndex = 0; rowIndex < data.length; rowIndex += 1) {
      const raw = data[rowIndex][index]
      const value = typeof raw === 'number' ? raw : String(raw ?? '').trim()
      if (index === 0 && rowIndex < LIMITS.preview) normalized.push([])
      if (rowIndex < LIMITS.preview) normalized[rowIndex].push(value)
      if (value === '') missing += 1
      else {
        nonMissing += 1
        if (unique.size <= 30) unique.add(String(value))
        if (typeof value !== 'number' && !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value))
          numeric = false
      }
    }
    return {
      name: header,
      type: numeric && nonMissing ? 'number' : unique.size <= 30 ? 'category' : 'text',
      missing,
      uniqueCount: unique.size,
      uniqueCountCapped: unique.size > 30,
      values: [...unique].slice(0, 30),
    }
  })
  return {
    id: crypto.randomUUID(),
    name,
    projectId: null,
    columns,
    rowCount: data.length,
    preview: normalized,
    createdAt: new Date().toISOString(),
  }
}
