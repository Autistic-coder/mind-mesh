import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  const response = await page.request.post('/api/auth/register', {
    data: {
      display_name: 'ML Browser Test',
      email: `ml-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'correct horse battery staple',
      password_confirmation: 'correct horse battery staple',
    },
  })
  expect(response.status()).toBe(201)
})

async function loadSample(page: Page, title: string) {
  await page.goto('/model-lab')
  const sample = page.locator('.sample-grid article').filter({ hasText: title })
  await sample.getByRole('button', { name: 'Load private copy' }).click()
  await expect(page.getByRole('heading', { name: 'Choose the question and answer.' })).toBeVisible()
}

async function moveToTraining(page: Page) {
  await page.getByRole('button', { name: /Continue/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Which information should the model use?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: /Continue/ }).click()
  await expect(page.getByRole('heading', { name: 'Train one model or compare two.' })).toBeVisible()
}

test('trains, saves, predicts, downloads a batch, and reopens classification results', async ({
  page,
}) => {
  test.setTimeout(45_000)
  await loadSample(page, 'Customer churn')
  await expect(page.getByLabel('What do you want to predict?')).toHaveValue('churn')
  await expect(page.getByText('Classification — predict a category', { exact: true })).toBeVisible()
  await moveToTraining(page)
  await page.getByRole('button', { name: /Start training/ }).click()
  await expect(page.getByRole('heading', { name: 'Logistic regression' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByRole('heading', { name: 'Random forest classifier' })).toBeVisible()
  await expect(page.getByText('Accuracy', { exact: true }).first()).toBeVisible()
  const logistic = page.locator('.result-card').filter({ hasText: 'Logistic regression' })
  await logistic.getByRole('button', { name: 'Use this model' }).click()
  await expect(logistic.getByText('Selected', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /6 Predictions/ }).click()
  await page.getByLabel(/tenure_months/).fill('8')
  await page.getByLabel(/monthly_spend/).fill('1650')
  await page.getByLabel(/support_calls/).fill('5')
  await page.getByLabel(/city/).fill('A city unseen during training')
  await page.getByLabel(/plan/).fill('Basic')
  await page.getByRole('button', { name: 'Predict one example', exact: true }).click()
  await expect(page.getByText('Model prediction')).toBeVisible()
  await expect(page.getByText(/estimated probability/).first()).toBeVisible()

  await page.getByLabel('Batch CSV').setInputFiles({
    name: 'batch.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'tenure_months,monthly_spend,support_calls,city,plan\n8,1650,5,Delhi,Basic\n48,850,1,Unknown,Premium\n',
    ),
  })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Predict from a CSV' }).click()
  expect((await download).suggestedFilename()).toBe('mindmesh-predictions.csv')
  await expect(page.locator('.notice')).toContainText('original row order')

  await page.reload()
  await page.getByRole('button', { name: /5 Results/ }).click()
  const savedRun = page.locator('.run-library button').filter({ hasText: 'customer-churn' }).first()
  await expect(savedRun).toBeVisible()
  await savedRun.click()
  await expect(page.getByText('Selected for predictions')).toBeVisible()
  await page.getByRole('button', { name: /6 Predictions/ }).click()
  await expect(page.getByText(/Using Logistic regression/)).toBeVisible()

  await page.goto('/account')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.goto('/register')
  await page.getByLabel('Display name').fill('Second ML Account')
  await page.getByLabel('Email address').fill(`second-${Date.now()}@example.com`)
  await page.locator('input[name="password"]').fill('correct horse battery staple')
  await page.locator('input[name="password-confirmation"]').fill('correct horse battery staple')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/')
  await page.goto('/model-lab')
  await page.getByRole('button', { name: /5 Results/ }).click()
  await expect(page.getByText('No run selected.')).toBeVisible()
  await expect(page.locator('.run-library')).toHaveCount(0)
})

test('trains regression and returns truthful held-out metrics and a numeric prediction', async ({
  page,
}) => {
  test.setTimeout(45_000)
  await loadSample(page, 'Monthly rent')
  await expect(page.getByLabel('What do you want to predict?')).toHaveValue('monthly_rent')
  await moveToTraining(page)
  await page.getByRole('button', { name: /Start training/ }).click()
  await expect(page.getByRole('heading', { name: 'Ridge regression' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText('MAE', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('R²', { exact: true }).first()).toBeVisible()
  const ridge = page.locator('.result-card').filter({ hasText: 'Ridge regression' })
  await ridge.getByRole('button', { name: 'Use this model' }).click()
  await page.getByRole('button', { name: /6 Predictions/ }).click()
  await page.getByLabel(/area_sq_ft/).fill('850')
  await page.getByLabel(/bedrooms/).fill('2')
  await page.getByLabel(/property_age/).fill('8')
  await page.getByLabel(/neighborhood/).fill('North')
  await page.getByLabel(/property_type/).fill('Apartment')
  await page.getByRole('button', { name: 'Predict one example', exact: true }).click()
  await expect(page.locator('.prediction-answer > strong')).toContainText(/\d/)
})

test('model wizard remains usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await loadSample(page, 'Customer churn')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: /Continue/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Which information should the model use?' }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('explains selected options and keeps configuration after a rate limit', async ({ page }) => {
  await loadSample(page, 'Customer churn')
  await expect(
    page.getByText(
      'Choose this when the answer is a group or label, such as whether a customer will leave: Yes or No.',
    ),
  ).toBeVisible()
  await page.getByRole('radio', { name: /Regression — predict a number/ }).click()
  await expect(page.getByText('The result is a numeric value.')).toBeVisible()
  await page.getByRole('radio', { name: /Classification — predict a category/ }).click()
  await moveToTraining(page)

  const checkedBefore = await page.locator('.algorithm-list input:checked').count()
  await page.route('**/api/ml/runs', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'Retry-After': '30' },
        body: JSON.stringify({
          detail: 'You’ve made several requests quickly. Please wait 30 seconds and try again.',
        }),
      })
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Start training' }).click()
  await expect(page.getByRole('alert')).toContainText('Please wait 30 seconds')
  await expect(page.locator('.algorithm-list input:checked')).toHaveCount(checkedBefore)
})
