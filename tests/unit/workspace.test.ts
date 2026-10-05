import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCsv, parseWorkbook } from '../../src/data/imports'
import { summarizeRows } from '../../src/data/datasets'
import { emptyWorkspace } from '../../src/data/seed'
import { loadWorkspace, validWorkspace } from '../../src/state/persistence'
import { reducer } from '../../src/state/store'

describe('dataset parsing', () => {
  it('handles quoted CSV, missing cells, schema inference and preview limits', () => {
    const dataset = parseCsv('Example', 'name,amount,group\n"One, two",12,A\nThree,,B\n')
    expect(dataset.rowCount).toBe(2)
    expect(dataset.preview[0]).toEqual(['One, two', '12', 'A'])
    expect(dataset.columns[1]).toMatchObject({ type: 'number', missing: 1 })
    const larger = summarizeRows('Large', [
      ['feature', 'target'],
      ...Array.from({ length: 30 }, (_, i) => [i, i % 2]),
    ])
    expect(larger.preview).toHaveLength(25)
    expect(larger.rowCount).toBe(30)
  })
  it.each(['', 'a,b\n', 'a,a\n1,2', 'a,A\n1,2', 'a,\n1,2', 'a,b\n1,2,3', 'a,b\n"unclosed,2'])(
    'rejects malformed or empty input: %s',
    (text) => expect(() => parseCsv('Bad', text)).toThrow(),
  )
  it('rejects row and column limits', () => {
    expect(() =>
      summarizeRows('Rows', [['a'], ...Array.from({ length: 200_001 }, () => [1])]),
    ).toThrow('200,000')
    expect(() =>
      summarizeRows('Columns', [
        Array.from({ length: 10_001 }, (_, i) => `c${i}`),
        Array(10_001).fill(1),
      ]),
    ).toThrow('10,000 columns')
  })
  it('discovers workbook sheets and parses the selected sheet', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['x', 'y'],
        [1, 2],
      ]),
      'First',
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['city', 'rent'],
        ['A', 1500],
      ]),
      'Rent',
    )
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    expect(await parseWorkbook('Book', buffer)).toEqual({ sheets: ['First', 'Rent'] })
    const result = await parseWorkbook('Book', buffer, 'Rent')
    expect('dataset' in result && result.dataset.rowCount).toBe(1)
    await expect(parseWorkbook('Bad', new TextEncoder().encode('x,y\n1,2').buffer)).rejects.toThrow(
      'not a valid XLSX',
    )
  })
})

describe('workspace without demo content', () => {
  it('starts empty and validates saved data', () => {
    const state = emptyWorkspace()
    expect(state).toMatchObject({ version: 2, projects: [], datasets: [] })
    expect(validWorkspace(state)).toBe(true)
    expect(loadWorkspace({ getItem: () => null }).state).toEqual(state)
    expect(loadWorkspace({ getItem: () => JSON.stringify(state) }).state).toEqual(state)
    expect(loadWorkspace({ getItem: () => '{broken' }).blocked).toBe(true)
  })
  it('migrates only custom projects and uploaded datasets from an old workspace', () => {
    const now = new Date().toISOString()
    const uploaded = summarizeRows('My data', [
      ['x', 'y'],
      [1, 2],
    ])
    const demo = {
      ...uploaded,
      id: 'demo-churn',
      name: 'Customer churn',
      source: 'synthetic',
      projectId: 'churn',
    }
    const legacy = {
      version: 1,
      displayName: 'Ada',
      projects: [
        { id: 'churn', name: 'Customer churn', description: '', demo: true, updatedAt: now },
        { id: 'mine', name: 'My project', description: '', demo: false, updatedAt: now },
      ],
      datasets: [demo, { ...uploaded, source: 'uploaded', projectId: 'mine' }],
      models: [{ id: 'fake' }],
      messages: [{ id: 'fake' }],
    }
    const result = loadWorkspace({ getItem: () => JSON.stringify(legacy) })
    expect(result.blocked).toBe(false)
    expect(result.state).toMatchObject({ displayName: 'Ada', version: 2 })
    expect(result.state.projects.map((project) => project.name)).toEqual(['My project'])
    expect(result.state.datasets.map((dataset) => dataset.name)).toEqual(['My data'])
    expect(result.state.datasets[0].projectId).toBe('mine')
    expect('models' in result.state).toBe(false)
  })
  it('unassigns datasets on project deletion and resets to empty', () => {
    const now = new Date().toISOString()
    const project = { id: 'mine', name: 'Mine', description: '', updatedAt: now }
    const dataset = { ...summarizeRows('Data', [['a'], [1]]), projectId: project.id }
    const state = { ...emptyWorkspace(), projects: [project], datasets: [dataset] }
    const removed = reducer(state, { type: 'project/delete', id: project.id })
    expect(removed.datasets[0].projectId).toBeNull()
    expect(validWorkspace(removed)).toBe(true)
  })
})
