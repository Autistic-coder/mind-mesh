import Papa from 'papaparse'
import { LIMITS, summarizeRows } from './datasets'
import type { Dataset } from '../state/types'

export function parseCsv(name: string, text: string): Dataset {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy', preview: LIMITS.rows + 2 })
  const error = result.errors.find(item => item.code !== 'UndetectableDelimiter')
  if (error) throw new Error(`CSV could not be read: ${error.message}${error.row !== undefined ? ` (row ${error.row + 1})` : ''}`)
  return summarizeRows(name, result.data)
}

export async function parseWorkbook(name: string, buffer: ArrayBuffer, sheetName?: string): Promise<{ sheets: string[] } | { dataset: Dataset }> {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('This is not a valid XLSX workbook. Export your data as .xlsx or .csv and try again.')
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array', dense: true, sheetRows: LIMITS.rows + 2, cellFormula: false, cellHTML: false, cellStyles: false })
  if (!workbook.SheetNames.length) throw new Error('This workbook has no worksheets.')
  if (!sheetName && workbook.SheetNames.length > 1) return { sheets: workbook.SheetNames }
  const chosen = sheetName ?? workbook.SheetNames[0]
  if (!workbook.SheetNames.includes(chosen)) throw new Error('Choose an available worksheet.')
  const sheet = workbook.Sheets[chosen]
  const range = sheet['!fullref'] ?? sheet['!ref']
  if (!range) throw new Error('This worksheet is empty. Choose a sheet containing a header and data.')
  const bounds = XLSX.utils.decode_range(range)
  if (bounds.e.r - bounds.s.r > LIMITS.rows) throw new Error('Use a dataset with 20,000 rows or fewer.')
  if (bounds.e.c - bounds.s.c + 1 > LIMITS.columns) throw new Error('Use a dataset with 100 columns or fewer.')
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false, raw: true })
  return { dataset: summarizeRows(workbook.SheetNames.length > 1 ? `${name} · ${chosen}` : name, rows) }
}
