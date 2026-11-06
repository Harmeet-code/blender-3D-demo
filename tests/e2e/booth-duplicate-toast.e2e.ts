import { expect, test } from '@playwright/test';

test('duplicate booth name and number show a toast and keep the edit', async ({ page }) => {
  const eventId = 'booth-duplicate-toast-test';
  const layout = {
    buildingId: eventId,
    floors: [{
      id: 'ground', name: 'Ground', heightOffset: 0, image: '',
      coordinateSystem: { units: 'meters' },
      authoring: {
        boundary: [[0, 0], [40, 0], [40, 40], [0, 40]],
        spawn: [2, 2], obstacles: [], instances: [], underlayOpacity: 0.85,
      },
    }],
    rooms: [], portals: [],
  };
  await page.route(`**/api/events/${eventId}/layout**`, (route) =>
    route.fulfill({ status: 200, json: route.request().url().endsWith('/draft') ? null : layout }),
  );
  await page.addInitScript((id) => {
    localStorage.clear();
    localStorage.setItem(`fp-floor-setup-dismissed:${id}`, 'true');
  }, eventId);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/admin/floor-plan?eventId=${eventId}`);
  const viewport = page.getByTestId('floor-plan-viewport');
  await expect(viewport).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /Preparing|Opening/ })).toHaveCount(0);
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  const draw = async (x1: number, y1: number, x2: number, y2: number) => {
    await page.keyboard.press('Shift+B');
    await page.mouse.click(x1, y1);
    await page.mouse.click(x2, y2);
  };
  await draw(x - 130, y - 30, x - 55, y + 15);
  const name = page.getByRole('textbox', { name: 'Object name', exact: true });
  const number = page.getByRole('textbox', { name: 'Booth number' });
  await expect(name).toBeVisible();
  const firstName = await name.inputValue();
  const firstNumber = await number.inputValue();
  await draw(x + 35, y - 30, x + 110, y + 15);
  await expect(name).not.toHaveValue(firstName);
  const secondName = await name.inputValue();
  await name.fill(` ${firstName.toUpperCase()} `);
  await name.press('Tab');
  await expect(page.locator('[data-sonner-toast]').getByText(/Booth name already exists/)).toBeVisible();
  await expect(name).toHaveValue(` ${firstName.toUpperCase()} `);
  await name.fill(secondName);
  await name.press('Tab');
  await number.fill(` ${firstNumber.toLowerCase()} `);
  await number.press('Tab');
  await expect(page.locator('[data-sonner-toast]').getByText(/Booth number already exists/)).toBeVisible();
  await expect(number).toHaveValue(` ${firstNumber.toLowerCase()} `);
});
