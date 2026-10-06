import { expect, test } from '@playwright/test';

test('floor switching, palette search, and room autopilot', async ({ page }) => {
  await page.goto('/view/default-event');
  await expect(page.getByRole('radio', { name: 'Ground Floor' })).toBeVisible();

  await page.getByRole('button', { name: /search booths/i }).click();
  const palette = page.getByRole('dialog');
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox').fill('room-101');
  await palette.getByRole('option', { name: /room-101/ }).click();

  await expect(page.getByRole('dialog', { name: 'room-101' })).toBeVisible();
  await expect(page.getByRole('button', { name: /stop walking to room-101/i })).toBeVisible({
    timeout: 60_000,
  });

  await page.getByRole('button', { name: /stop walking to room-101/i }).click();
  await expect(page.getByRole('button', { name: /stop walking/i })).toHaveCount(0);
});
