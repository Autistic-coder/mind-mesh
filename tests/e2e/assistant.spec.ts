import { expect, test } from '@playwright/test'

test('assistant gives honest setup help and requires explicit context sharing', async ({
  page,
}) => {
  const response = await page.request.post('/api/auth/register', {
    data: {
      display_name: 'Assistant test',
      email: `assistant-${Date.now()}@example.com`,
      password: 'correct horse battery staple',
      password_confirmation: 'correct horse battery staple',
    },
  })
  expect(response.status()).toBe(201)
  await page.goto('/assistant')
  await expect(page.getByText('Static help — not an AI response')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send question' })).toBeDisabled()
  await page.getByLabel('Your question').fill('What is a target?')
  await expect(page.getByLabel('Your question')).toHaveValue('What is a target?')
  await page.getByText('Optional context — review before sharing').click()
  await expect(page.getByRole('button', { name: 'Preview summary' })).toBeDisabled()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
