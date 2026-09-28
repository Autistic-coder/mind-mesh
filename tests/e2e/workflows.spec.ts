import { test, expect, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'

async function uploadCsv(page: Page, name = 'Research.csv') {
  await page.getByLabel('Upload dataset').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from('age,income,outcome\n25,40000,Yes\n40,75000,No\n32,52000,Yes'),
  })
  await expect(
    page.getByRole('heading', { name: name.replace('.csv', ''), exact: true }),
  ).toBeVisible()
}

test('overview matches reference structure and all navigation links work', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1672, height: 941 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Good .*Vaibhav/ })).toBeVisible()
  await expect(page.getByRole('link', { name: '03 Datasets', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '06 Models', exact: true })).toBeVisible()
  await page.screenshot({ path: '.local/overview-desktop.png', fullPage: true })
  for (const [name, heading] of [
    ['Projects', 'Your projects.'],
    ['Datasets', 'Meet your data.'],
    ['Train', 'Find your approach.'],
    ['Models', 'Your model library.'],
    ['Predictions', 'Try a what-if.'],
    ['Ask MindMesh', 'Ask MindMesh.'],
    ['Overview', /Good /],
  ] as const) {
    await page.getByRole('navigation').getByRole('link', { name, exact: true }).click()
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('create project, import CSV, assign, simulate, predict and retain after refresh', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Project name', { exact: true }).fill('Research project')
  await page.getByLabel('Description').fill('Browser acceptance test')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Research project', exact: true })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Datasets' }).click()
  await uploadCsv(page)
  await page.getByLabel('Assign to project').selectOption({ label: 'Research project' })
  await expect(page.getByRole('cell', { name: '40000', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Assign to project')).toHaveValue(/.+/)
  await page.getByRole('navigation').getByRole('link', { name: 'Train', exact: true }).click()
  await page.getByLabel('01 / Project').selectOption({ label: 'Research project' })
  await page.getByLabel('02 / Dataset').selectOption({ label: 'Research' })
  await page.getByLabel('03 / Target column').selectOption('outcome')
  await page.getByRole('button', { name: 'Run demo simulation' }).click()
  await expect(page.getByRole('progressbar')).toBeVisible()
  await expect(page.getByText('Demo simulation complete.', { exact: false })).toBeVisible()
  await page.getByRole('link', { name: 'Random forest', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Random forest', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Try a prediction' }).click()
  await page.getByRole('button', { name: 'Simulate prediction', exact: true }).click()
  await expect(page.getByText('age is required.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Fill example values' }).click()
  await page.getByRole('button', { name: 'Simulate prediction', exact: true }).click()
  await expect(page.getByText('Simulated result', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Choose a demo model')).toContainText('Research project')
})

test('multi-sheet workbook upload and malformed files show useful results', async ({ page }) => {
  await page.goto('/datasets')
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
      ['area', 'rent'],
      [500, 1200],
      [800, 1700],
    ]),
    'Rent',
  )
  await page.getByLabel('Upload dataset').setInputFiles({
    name: 'Homes.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
  })
  await page.getByRole('combobox', { name: 'Worksheet', exact: true }).selectOption('Rent')
  await page.getByRole('button', { name: 'Import worksheet' }).click()
  await expect(page.getByRole('heading', { name: 'Homes · Rent', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '1700', exact: true })).toBeVisible()
  for (const [name, content, error] of [
    ['empty.csv', '', 'This file is empty'],
    ['bad.csv', 'x,x\n1,2', 'Column headers must be unique'],
    ['bad.txt', 'hello', 'Choose a CSV or XLSX'],
    ['fake.xlsx', 'x,y\n1,2', 'not a valid XLSX'],
  ] as const) {
    await page
      .getByLabel('Upload dataset')
      .setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(content) })
    await expect(page.getByRole('alert')).toContainText(error)
  }
})

test('training cancellation creates no models; regression shows correct metrics', async ({
  page,
}) => {
  await page.goto('/train')
  await page.getByLabel('02 / Dataset').selectOption('demo-churn')
  await page.getByLabel('03 / Target column').selectOption('churn')
  await page.getByLabel('04 / Task').selectOption('regression')
  await expect(page.getByRole('alert')).toContainText('numeric')
  await page.getByLabel('04 / Task').selectOption('classification')
  await page.getByRole('button', { name: 'Run demo simulation' }).click()
  await page.getByRole('button', { name: 'Cancel simulation' }).click()
  await expect(page.getByRole('status')).toContainText('No model entries were created')
  await page.goto('/models')
  await expect(page.getByText('6 models', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Task', exact: true }).selectOption('regression')
  await expect(page.getByText('2 models', { exact: true })).toBeVisible()
  await expect(page.getByText('Accuracy', { exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Gradient boosting', exact: true }).click()
  await expect(page.getByText('Sample MAE', { exact: true })).toBeVisible()
  await expect(page.getByText('Sample RMSE', { exact: true })).toBeVisible()
  await expect(page.getByText('Sample R²', { exact: true })).toBeVisible()
})

test('overview question handoff, chat validation, suggestions and history', async ({ page }) => {
  await page.goto('/')
  await page
    .getByLabel('Ask about a dataset or model', { exact: true })
    .fill('Explain customer churn')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByLabel('Your question')).toHaveValue('Explain customer churn')
  await expect(page.getByLabel('Your question')).toBeFocused()
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('log')).toContainText('Sample response')
  await expect(page.getByRole('log')).toContainText('Customer churn is a classification example')
  await page.reload()
  await expect(page.getByRole('log')).toContainText('Explain customer churn')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Write a question')
  await page.getByLabel('Your question').fill('Tell me about Mars')
  await page.getByLabel('Your question').press('Enter')
  await expect(page.getByRole('log')).toContainText('cannot analyze your uploaded data')
  await page.getByRole('button', { name: 'Clear conversation', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Clear conversation', exact: true })
    .click()
  await page.getByRole('button', { name: /How should I evaluate monthly rent/ }).click()
  await expect(page.getByLabel('Your question')).toHaveValue('How should I evaluate monthly rent?')
})

test('deletion keeps model snapshots and project deletion removes related models', async ({
  page,
}) => {
  await page.goto('/datasets')
  await page.getByRole('button', { name: 'Remove Customer churn', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove dataset', exact: true })
    .click()
  await page.goto('/models')
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption('churn')
  await page.getByRole('link', { name: 'Random forest', exact: true }).click()
  await expect(page.getByText('Source removed', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Try a prediction' }).click()
  await page.getByRole('button', { name: 'Fill example values' }).click()
  await page.getByRole('button', { name: 'Simulate prediction', exact: true }).click()
  await expect(page.getByText('Simulated result', { exact: true })).toBeVisible()
  await page.goto('/projects/churn')
  await page.getByRole('button', { name: 'Delete project', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete project', exact: true })
    .click()
  await page.goto('/models')
  await expect(page.getByText('4 models', { exact: true })).toBeVisible()
})

test('profile and reset restore the original demo', async ({ page }) => {
  await page.goto('/datasets')
  await uploadCsv(page)
  await page.getByRole('button', { name: 'Workspace settings' }).click()
  await page.getByLabel('Display name').fill('Ada')
  await page.getByRole('button', { name: 'Save name' }).click()
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Good .*Ada/ })).toBeVisible()
  await page.getByRole('button', { name: 'Workspace settings' }).click()
  await page.getByRole('button', { name: 'Reset local workspace', exact: true }).click()
  await page.getByRole('button', { name: 'Reset workspace', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Good .*Vaibhav/ })).toBeVisible()
  await expect(page.getByRole('link', { name: '03 Datasets', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: '06 Models', exact: true })).toBeVisible()
})

test('corrupt storage is not silently overwritten', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('corrupt-seeded')) {
      localStorage.setItem('mindmesh.workspace.v1', '{broken')
      sessionStorage.setItem('corrupt-seeded', 'true')
    }
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('Saved workspace could not be read')
  expect(await page.evaluate(() => localStorage.getItem('mindmesh.workspace.v1'))).toBe('{broken')
  await page.getByRole('button', { name: 'Workspace settings' }).click()
  await page.getByRole('button', { name: 'Reset local workspace', exact: true }).click()
  await page.getByRole('button', { name: 'Reset workspace', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('mobile layout and keyboard modal flow are usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: '.local/overview-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('navigation').getByRole('link', { name: 'Datasets', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Meet your data.' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: 'New project' }).click()
  await expect(page.getByLabel('Project name', { exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'New project' })).toBeFocused()
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeFocused()
  for (const path of ['/train', '/models', '/predictions', '/ask', '/projects']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('storage quota failures keep the current session usable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Full', 'QuotaExceededError')
    }
  })
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('session-only')
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Project name', { exact: true }).fill('Session project')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Session project', exact: true })).toBeVisible()
})

test('navigating away cancels training without adding models', async ({ page }) => {
  await page.goto('/train')
  await page.clock.install()
  await page.getByLabel('02 / Dataset').selectOption('demo-churn')
  await page.getByLabel('03 / Target column').selectOption('churn')
  await page.getByRole('button', { name: 'Run demo simulation' }).click()
  await page.getByRole('navigation').getByRole('link', { name: 'Models', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your model library.', exact: true })).toBeVisible()
  await page.clock.fastForward(5000)
  await expect(page.getByText('6 models', { exact: true })).toBeVisible()
})
