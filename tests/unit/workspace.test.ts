import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCsv, parseWorkbook } from '../../src/data/imports'
import { summarizeRows } from '../../src/data/datasets'
import { seedWorkspace } from '../../src/data/seed'
import { sampleModels, trainingError } from '../../src/data/models'
import { predictionErrors, simulatePrediction } from '../../src/data/predictions'
import {
  loadWorkspace,
  saveWorkspace,
  STORAGE_BUDGET,
  validWorkspace,
} from '../../src/state/persistence'
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
    (text) => {
      expect(() => parseCsv('Bad', text)).toThrow()
    },
  )
  it('rejects row and column limits', () => {
    expect(() =>
      summarizeRows('Rows', [['a'], ...Array.from({ length: 20_001 }, () => [1])]),
    ).toThrow('20,000')
    expect(() =>
      summarizeRows('Columns', [
        Array.from({ length: 101 }, (_, i) => `c${i}`),
        Array(101).fill(1),
      ]),
    ).toThrow('100 columns')
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
        ['Example', 1500],
        ['Other', 1800],
      ]),
      'Rent',
    )
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    expect(await parseWorkbook('Book', buffer)).toEqual({ sheets: ['First', 'Rent'] })
    const result = await parseWorkbook('Book', buffer, 'Rent')
    expect('dataset' in result && result.dataset.rowCount).toBe(2)
    await expect(parseWorkbook('Bad', new TextEncoder().encode('x,y\n1,2').buffer)).rejects.toThrow(
      'not a valid XLSX',
    )
    await expect(parseWorkbook('Book', buffer, 'Missing')).rejects.toThrow('available worksheet')
  })
})

describe('demo model behavior', () => {
  it('enforces target compatibility and excludes target from features', () => {
    const state = seedWorkspace()
    expect(trainingError(state.datasets[0], 'churn', 'regression')).toContain('numeric')
    expect(trainingError(undefined, 'target', 'classification')).toContain('Choose a dataset')
    const constant = summarizeRows('Constant', [
      ['x', 'y'],
      [1, 'A'],
      [2, 'A'],
    ])
    expect(trainingError(constant, 'y', 'classification')).toContain('two distinct')
    const regression = sampleModels(state.datasets[1], 'rent', 'monthly_rent', 'regression')[0]
    expect(regression.features.some((feature) => feature.name === 'monthly_rent')).toBe(false)
    expect(Object.keys(regression.metrics)).toEqual(['MAE', 'RMSE', 'R²'])
    expect(regression.demo).toBe(true)
  })
  it('validates required values and produces deterministic illustrative outcomes', () => {
    const model = seedWorkspace().models[0]
    expect(Object.keys(predictionErrors(model, {}))).toHaveLength(model.features.length)
    const values = Object.fromEntries(
      model.features.map((feature) => [feature.name, feature.values[0]]),
    )
    expect(predictionErrors(model, values)).toEqual({})
    expect(simulatePrediction(model, values)).toBe(simulatePrediction(model, values))
    expect(model.target.values).toContain(simulatePrediction(model, values))
    expect(
      predictionErrors(model, { ...values, tenure_months: 'Infinity', contract: 'Unknown' }),
    ).toHaveProperty('contract')
    expect(() => simulatePrediction(model, {})).toThrow()
  })
})

describe('persistence and relationships', () => {
  it('round-trips valid data and blocks overwriting corrupted data', () => {
    const state = seedWorkspace()
    expect(validWorkspace(state)).toBe(true)
    expect(loadWorkspace({ getItem: () => JSON.stringify(state) }).state).toEqual(state)
    expect(loadWorkspace({ getItem: () => '{broken' }).blocked).toBe(true)
    expect(
      loadWorkspace({ getItem: () => JSON.stringify({ ...state, models: [{ id: 'bad' }] }) })
        .blocked,
    ).toBe(true)
    expect(
      loadWorkspace({
        getItem: () => {
          throw new Error('denied')
        },
      }).warning,
    ).not.toBe('')
  })
  it('reports quota and size failures instead of throwing', () => {
    const state = seedWorkspace()
    expect(
      saveWorkspace(
        {
          setItem: () => {
            throw new Error('QuotaExceededError')
          },
        },
        state,
      ),
    ).toContain('session-only')
    let written = false
    expect(
      saveWorkspace(
        {
          setItem: () => {
            written = true
          },
        },
        { ...state, displayName: 'x'.repeat(STORAGE_BUDGET) },
      ),
    ).toContain('Storage budget')
    expect(written).toBe(false)
  })
  it('unassigns data and removes related models when a project is deleted', () => {
    const state = reducer(seedWorkspace(), { type: 'project/delete', id: 'churn' })
    expect(state.models).toHaveLength(4)
    expect(state.datasets.find((dataset) => dataset.id === 'demo-churn')?.projectId).toBeNull()
    expect(validWorkspace(state)).toBe(true)
  })
  it('retains model snapshots after dataset removal and limits chat history', () => {
    const state = seedWorkspace()
    const removed = reducer(state, { type: 'dataset/delete', id: 'demo-churn' })
    expect(removed.models[0]).toEqual(state.models[0])
    expect(validWorkspace(removed)).toBe(true)
    const messages = Array.from({ length: 104 }, (_, i) => ({
      id: String(i),
      role: 'user' as const,
      content: 'Question',
      demo: false,
      createdAt: new Date().toISOString(),
    }))
    expect(reducer(state, { type: 'messages/add', messages }).messages).toHaveLength(100)
    expect(reducer(removed, { type: 'reset' }).datasets).toHaveLength(3)
  })
})
