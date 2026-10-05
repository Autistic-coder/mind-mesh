/// <reference lib="webworker" />
import { parseCsv, parseWorkbook } from './imports'
import { LIMITS } from './datasets'

self.onmessage = async (event: MessageEvent<{ file: File; sheetName?: string }>) => {
  const { file, sheetName } = event.data
  try {
    if (file.size > LIMITS.bytes) throw new Error('Choose a file no larger than 25 MB.')
    if (!file.size) throw new Error('This file is empty. Choose a file with headers and data.')
    const name = file.name.replace(/\.(csv|xlsx)$/i, '')
    if (/\.csv$/i.test(file.name)) {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
      self.postMessage({ dataset: parseCsv(name, text) })
    } else if (/\.xlsx$/i.test(file.name)) {
      self.postMessage(await parseWorkbook(name, await file.arrayBuffer(), sheetName))
    } else throw new Error('Choose a CSV or XLSX file. Other file types are not supported.')
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'This file could not be read.',
    })
  }
}
