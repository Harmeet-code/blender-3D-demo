import { expect, test } from '@playwright/test';

test('booth reservation succeeds and shows the pending order', async ({ page }) => {
  await page.goto('/view/default-event');
  await expect(page.getByRole('radio', { name: 'Ground Floor' })).toBeVisible();

  await page.getByRole('button', { name: /search booths/i }).click();
  const palette = page.getByRole('dialog');
  await palette.getByRole('combobox').fill('room-101');
  await palette.getByRole('option', { name: /room-101/ }).click();

  const sheet = page.getByRole('dialog', { name: 'room-101' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('checkbox', { name: /chair/i }).check();
  await sheet.getByRole('button', { name: /reserve/i }).click();

  await expect(sheet.getByText(/pending order id/i)).toBeVisible();
});
