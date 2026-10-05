import { test, expect, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'

test.beforeEach(async ({ page }) => {
  const email = `workspace-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const response = await page.request.post('/api/auth/register', {
    data: {
      display_name: 'Browser Test',
      email,
      password: 'correct horse battery staple',
      password_confirmation: 'correct horse battery staple',
    },
  })
  expect(response.status()).toBe(201)
})

async function uploadCsv(page: Page, name = 'Research.csv', project?: string) {
  await page.getByLabel('Upload dataset').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from('age,income,outcome\n25,40000,Yes\n40,75000,No'),
  })
  const review = page.getByRole('dialog', { name: 'Review dataset' })
  await expect(review).toContainText('2 rows · 3 columns')
  if (project) await review.getByLabel('Project (optional)').selectOption({ label: project })
  await review.getByRole('button', { name: 'Save dataset' }).click()
  await expect(
    page.getByRole('heading', { name: name.replace('.csv', ''), exact: true }),
  ).toBeVisible()
}

test('new accounts start empty and navigate between workspace pages', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: '00 Projects' })).toBeVisible()
  await expect(page.getByRole('link', { name: '00 Datasets' })).toBeVisible()
  await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(3)
  await page.getByRole('navigation').getByRole('link', { name: 'Projects' }).click()
  await expect(page.getByRole('heading', { name: 'Your projects.' })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Datasets' }).click()
  await expect(page.getByRole('heading', { name: 'Meet your data.' })).toBeVisible()
  await expect(page.getByText('Your data belongs here.')).toBeVisible()
})

test('loads an account-owned sample project on deliberate request', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: '00 Projects' })).toBeVisible()
  await page.getByRole('button', { name: 'Load sample project' }).click()
  await expect(page.getByRole('heading', { name: 'Sample research', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sample research', exact: true })).toBeVisible()
})

test('creates a project, imports data, assigns it, and retains it after refresh', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Project name', { exact: true }).fill('Research project')
  await page.getByLabel('Description').fill('Browser acceptance test')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Research project', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Add or manage datasets' }).click()
  await expect(page).toHaveURL(/\/datasets\?project=/)
  await uploadCsv(page)
  await expect(page.getByLabel('Assign to project')).toHaveValue(/.+/)
  const information = page.locator('.dataset-facts')
  await expect(information.getByText('Research.csv', { exact: true })).toBeVisible()
  await expect(information.getByText('CSV', { exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '40000', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Assign to project')).toHaveValue(/.+/)
  await page.getByRole('navigation').getByRole('link', { name: 'Projects' }).click()
  await page.getByRole('link', { name: 'Research project', exact: true }).click()
  await expect(page.locator('.item-list').getByRole('link')).toContainText('Research')
})

test('imports a selected workbook sheet and reports invalid files', async ({ page }) => {
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
    ]),
    'Rent',
  )
  await page.getByLabel('Upload dataset').setInputFiles({
    name: 'Homes.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
  })
  await page.getByRole('combobox', { name: 'Worksheet' }).selectOption('Rent')
  await page.getByRole('button', { name: 'Review worksheet' }).click()
  const review = page.getByRole('dialog', { name: 'Review dataset' })
  await expect(review.getByText('Rent', { exact: true })).toBeVisible()
  await review.getByRole('button', { name: 'Save dataset' }).click()
  await expect(
    page.locator('.dataset-facts').getByText('Homes.xlsx', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('.dataset-facts').getByText('Rent', { exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '1200', exact: true })).toBeVisible()
  await page.getByLabel('Upload dataset').setInputFiles({
    name: 'bad.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('x,x\n1,2'),
  })
  await expect(page.getByRole('alert')).toContainText('Column headers must be unique')
})

test('removes a dataset and resets to an empty account workspace', async ({ page }) => {
  await page.goto('/datasets')
  await uploadCsv(page)
  await page.getByRole('button', { name: 'Remove Research' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove dataset' }).click()
  await expect(page.getByText('Dataset removed.')).toBeVisible()
  await uploadCsv(page)
  await page.getByRole('button', { name: 'Workspace settings' }).click()
  await page.getByRole('button', { name: 'Reset workspace' }).click()
  await page.getByRole('button', { name: 'Reset workspace' }).click()
  await expect(page.getByRole('link', { name: '00 Datasets' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: '00 Datasets' })).toBeVisible()
})

test('cancels a reviewed upload without saving and can retry', async ({ page }) => {
  await page.goto('/datasets')
  await page.getByLabel('Upload dataset').setInputFiles({
    name: 'Draft.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('x,y\n1,2'),
  })
  const review = page.getByRole('dialog', { name: 'Review dataset' })
  await review.getByRole('button', { name: 'Cancel' }).click()
  await expect(review).toHaveCount(0)
  await expect(page.getByText('Draft', { exact: true })).toHaveCount(0)
  await uploadCsv(page, 'Retry.csv')
  await expect(page.getByRole('heading', { name: 'Retry', exact: true })).toBeVisible()
})

test('keeps a reviewed file available after a temporary save failure', async ({ page }) => {
  await page.goto('/datasets')
  await page.getByLabel('Upload dataset').setInputFiles({
    name: 'Resilient.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('x,y\n1,2'),
  })
  const review = page.getByRole('dialog', { name: 'Review dataset' })
  await page.route('**/api/datasets', async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
  })
  await review.getByRole('button', { name: 'Save dataset' }).click()
  await expect(review.getByRole('alert')).toContainText('temporarily unavailable')
  await page.unroute('**/api/datasets')
  await review.getByRole('button', { name: 'Save dataset' }).click()
  await expect(page.getByRole('heading', { name: 'Resilient', exact: true })).toBeVisible()
})

test('does not attach old anonymous content to a signed-in account', async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date().toISOString()
    localStorage.setItem(
      'mindmesh.workspace.v1',
      JSON.stringify({
        version: 1,
        displayName: 'Ada',
        projects: [
          { id: 'churn', name: 'Customer churn', description: '', demo: true, updatedAt: now },
          { id: 'mine', name: 'Mine', description: '', demo: false, updatedAt: now },
        ],
        datasets: [
          {
            id: 'old-data',
            name: 'Browser data',
            source: 'uploaded',
            projectId: 'mine',
            columns: [{ name: 'value', type: 'number', missing: 0, uniqueCount: 1, values: ['1'] }],
            rowCount: 1,
            preview: [[1]],
            createdAt: now,
          },
        ],
        models: [],
        messages: [],
      }),
    )
  })
  await page.goto('/')
  await expect(page.getByRole('link', { name: '00 Projects' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Mine', exact: true })).toHaveCount(0)
  await expect(page.getByText('Customer churn')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('mindmesh.workspace.v1'))).toContain('Mine')
  await page.getByRole('button', { name: 'Workspace settings' }).click()
  await page.getByRole('button', { name: 'Review browser copy' }).click()
  await expect(page.getByRole('dialog')).toContainText('1 projects and 1 dataset previews')
  await page.getByRole('button', { name: 'Import into this account' }).click()
  await expect(page.getByRole('status')).toContainText('Imported 1 projects')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.goto('/projects')
  await expect(page.getByRole('link', { name: 'Mine', exact: true })).toBeVisible()
  await expect(page.getByText('Customer churn')).toHaveCount(0)
  await page.goto('/datasets')
  await page.locator('.dataset-open').filter({ hasText: 'Browser data' }).click()
  await expect(page.getByText('Preview-only record')).toBeVisible()
  await expect(page.getByText(/Re-upload the CSV or XLSX file/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Download original' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Preview-only record')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('mindmesh.workspace.v1'))).toContain('Mine')
})

test('corrupt anonymous storage stays untouched and cannot overwrite account data', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('corrupt-seeded')) {
      localStorage.setItem('mindmesh.workspace.v1', '{broken')
      sessionStorage.setItem('corrupt-seeded', 'true')
    }
  })
  await page.goto('/')
  await expect(page.getByRole('link', { name: '00 Projects' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('mindmesh.workspace.v1'))).toBe('{broken')
  await page.getByRole('button', { name: 'Workspace settings' }).click()
  await page.getByRole('button', { name: 'Review browser copy' }).click()
  await expect(page.getByRole('alert')).toContainText('could not be read')
})

test('mobile layout and project dialog are usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('navigation').getByRole('link', { name: 'Datasets' }).click()
  await expect(page.getByRole('heading', { name: 'Meet your data.' })).toBeVisible()
  await page.getByRole('button', { name: 'New project' }).click()
  await expect(page.getByLabel('Project name', { exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByLabel('Upload dataset').setInputFiles({
    name: 'Mobile.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('x,y\n1,2'),
  })
  const review = page.getByRole('dialog', { name: 'Review dataset' })
  await expect(review).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await review.getByRole('button', { name: 'Save dataset' }).click()
  await expect(page.getByRole('heading', { name: 'Mobile' })).toBeVisible()
  await expect(page.getByLabel('Dataset information')).toContainText('Mobile.csv')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
