import { summarizeRows } from './datasets'
import { sampleModels } from './models'
import type { Workspace } from '../state/types'

export function seedWorkspace(): Workspace {
  const now = new Date().toISOString()
  const projects = [
    { id: 'churn', name: 'Customer churn', description: 'Explore the signals behind customer retention using a small synthetic subscription dataset.', demo: true, updatedAt: now },
    { id: 'rent', name: 'Monthly rent', description: 'Explore how apartment features relate to monthly rent. All properties and prices are synthetic.', demo: true, updatedAt: now },
    { id: 'equipment', name: 'Equipment failure', description: 'Explore maintenance signals using synthetic equipment readings.', demo: true, updatedAt: now },
  ]
  const datasets = [
    summarizeRows('Customer churn', [['tenure_months', 'monthly_charge', 'contract', 'churn'], ...Array.from({ length: 24 }, (_, i) => [i * 3 + 1, 29 + (i % 8) * 12, i % 3 ? 'Monthly' : 'Annual', i % 4 === 0 ? 'Yes' : 'No'])]),
    summarizeRows('Monthly rent', [['area_sqft', 'bedrooms', 'neighborhood', 'monthly_rent'], ...Array.from({ length: 24 }, (_, i) => [450 + i * 55, 1 + i % 3, ['Central', 'Riverside', 'Suburban'][i % 3], 900 + i * 95])]),
    summarizeRows('Equipment failure', [['temperature_c', 'vibration_mm_s', 'operating_hours', 'failure'], ...Array.from({ length: 24 }, (_, i) => [42 + i * 2, Number((.8 + i * .14).toFixed(2)), 200 + i * 120, i % 5 === 0 ? 'Yes' : 'No'])]),
  ].map((dataset, i) => ({ ...dataset, id: `demo-${projects[i].id}`, source: 'synthetic' as const, projectId: projects[i].id }))
  const models = datasets.flatMap((dataset, i) => sampleModels(dataset, projects[i].id, dataset.columns.at(-1)!.name, i === 1 ? 'regression' : 'classification'))
  return { version: 1, displayName: 'Vaibhav', projects, datasets, models, messages: [] }
}
