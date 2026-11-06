import { expect, test } from '@playwright/test';

test('shipping preview renders and switches variants without a page error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?shippingPreview=1');
  await expect(page.getByRole('heading', { name: 'Shipping and receiving preview' })).toBeVisible();
  await expect(page.getByLabel('Shipping geometry preview').locator('canvas')).toBeVisible();
  for (const name of ['Container yard', 'Staging apron', 'Dock bay']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
