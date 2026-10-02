import { expect, test, type Page } from '@playwright/test'

async function createAccount(page: Page, email: string, name: string) {
  await page.goto('/register')
  await page.getByLabel('Display name').fill(name)
  await page.getByLabel('Email address').fill(email)
  await page.locator('input[name="password"]').fill('correct horse battery staple')
  await page.locator('input[name="password-confirmation"]').fill('correct horse battery staple')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/')
}

async function signOut(page: Page) {
  await page.goto('/account')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL('/sign-in')
}

test('account switching clears workspace data and sign-in restores the requested page', async ({
  page,
}) => {
  const alice = `alice-${Date.now()}@example.com`
  const bob = `bob-${Date.now()}@example.com`
  await createAccount(page, alice, 'Alice')
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByLabel('Project name', { exact: true }).fill('Alice research')
  await page.getByRole('button', { name: 'Create project' }).click()
  await expect(page.getByRole('heading', { name: 'Alice research', exact: true })).toBeVisible()
  const privatePath = new URL(page.url()).pathname

  await signOut(page)
  await createAccount(page, bob, 'Bob')
  await page.goto('/projects')
  await expect(page.getByText('Alice research')).toHaveCount(0)
  await page.goto(privatePath)
  await expect(page.getByRole('heading', { name: 'Project not found' })).toBeVisible()

  await signOut(page)
  await page.goto(privatePath)
  await expect(page).toHaveURL(/\/sign-in\?next=/)
  await page.getByLabel('Email address').fill(alice)
  await page.locator('input[name="password"]').fill('correct horse battery staple')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(privatePath)
  await expect(page.getByRole('heading', { name: 'Alice research', exact: true })).toBeVisible()
})

test('mobile registration keeps a clear keyboard path without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/register')
  await expect(page.getByLabel('Display name')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Email address')).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
