import { expect, test } from '@playwright/test';
import sharp from 'sharp';

test('drawing and transform guides render over a transparent-pass floor image', async ({ page }) => {
  const eventId = 'guide-visibility-test';
  let savedDimensions: number[] | undefined;
  const image = await sharp({
    create: { width: 64, height: 64, channels: 4, background: '#eeeeee' },
  }).png().toBuffer();
  const layout = {
    buildingId: eventId,
    floors: [{
      id: 'ground', name: 'Ground', heightOffset: 0, image: '/api/media/guide-floor.png',
      coordinateSystem: { units: 'meters' },
      authoring: {
        boundary: [[0, 0], [40, 0], [40, 40], [0, 40]],
        spawn: [2, 2], obstacles: [], instances: [], imageSize: [64, 64], underlayOpacity: 0.85,
      },
    }],
    rooms: [], portals: [],
  };
  await page.route('**/api/media/guide-floor.png', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: image }),
  );
  await page.route(`**/api/events/${eventId}/layout**`, (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as {
        floors: { authoring?: { instances: { dimensions: number[] }[] } }[];
      };
      savedDimensions = body.floors[0]?.authoring?.instances[0]?.dimensions;
      return route.fulfill({ status: 200, json: { saved: true } });
    }
    return route.fulfill({ status: 200, json: route.request().url().endsWith('/draft') ? null : layout });
  });
  await page.addInitScript((id) => {
    localStorage.clear();
    localStorage.setItem(`fp-floor-setup-dismissed:${id}`, 'true');
  }, eventId);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/admin/floor-plan?eventId=${eventId}`);
  await expect(page.getByTestId('floor-plan-viewport')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /Preparing|Opening/ })).toHaveCount(0);
  const canvas = page.getByTestId('floor-plan-viewport').locator('canvas').first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.keyboard.press('Shift+B');
  await page.mouse.click(x - 70, y - 20);
  const before = await sharp(await canvas.screenshot()).removeAlpha().raw().toBuffer();
  await page.mouse.move(x + 70, y + 40);
  const newlyDarkPixels = async (baseline: Buffer) => {
    const after = await sharp(await canvas.screenshot()).removeAlpha().raw().toBuffer();
    let darkened = 0;
    for (let i = 0; i < Math.min(baseline.length, after.length); i += 3) {
      if (baseline[i]! > 100 && baseline[i + 1]! > 100 && baseline[i + 2]! > 100 &&
          after[i]! < 50 && after[i + 1]! < 50 && after[i + 2]! < 50) {
        darkened++;
      }
    }
    return darkened;
  };
  await expect.poll(() => newlyDarkPixels(before), { timeout: 10_000 }).toBeGreaterThan(100);
  await page.mouse.click(x + 70, y + 40);
  await expect(page.getByRole('toolbar', { name: 'Selected item actions' })).toBeVisible();
  await page.mouse.move(x, y + 10);
  const tooltip = page.locator('.fp-hover-tooltip');
  await expect(tooltip).toBeVisible();
  const tooltipBox = await tooltip.boundingBox();
  expect(tooltipBox).not.toBeNull();
  expect(tooltipBox!.y + tooltipBox!.height).toBeLessThan(y + 10);
  expect(tooltipBox!.x).toBeGreaterThanOrEqual(box!.x);
  expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(box!.x + box!.width);
  const beforeResize = await sharp(await canvas.screenshot()).removeAlpha().raw().toBuffer();
  await page.keyboard.press('Shift+R');
  await expect.poll(() => newlyDarkPixels(beforeResize), { timeout: 10_000 }).toBeGreaterThan(100);
  const width = page.getByRole('spinbutton', { name: 'Width (m)' });
  const depth = page.getByRole('spinbutton', { name: 'Depth (m)' });
  const initialDimensions = [await width.inputValue(), await depth.inputValue()];
  const handle = page.getByRole('button', { name: 'Resize corner 3' });
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  const hx = handleBox!.x + handleBox!.width / 2;
  const hy = handleBox!.y + handleBox!.height / 2;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + 35, hy + 15, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => [await width.inputValue(), await depth.inputValue()]).not.toEqual(initialDimensions);
  const resizedWidth = Number(await width.inputValue());
  const resizedDepth = Number(await depth.inputValue());
  await page.keyboard.press('Shift+S');
  await expect.poll(() => savedDimensions).toBeDefined();
  expect(savedDimensions![0]).toBeCloseTo(resizedWidth);
  expect(savedDimensions![2]).toBeCloseTo(resizedDepth);
  await page.keyboard.press('Escape');
  const beforeMove = await sharp(await canvas.screenshot()).removeAlpha().raw().toBuffer();
  await page.keyboard.press('Shift+M');
  await expect.poll(() => newlyDarkPixels(beforeMove), { timeout: 10_000 }).toBeGreaterThan(100);
  const beforeMoving = await sharp(await canvas.screenshot()).removeAlpha().raw().toBuffer();
  await page.mouse.move(x + 125, y - 20);
  await expect.poll(() => newlyDarkPixels(beforeMoving), { timeout: 10_000 }).toBeGreaterThan(100);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+P');
  await page.mouse.click(x - 120, y + 70);
  const beforePolygon = await sharp(await canvas.screenshot()).removeAlpha().raw().toBuffer();
  await page.mouse.move(x - 20, y + 80);
  await expect.poll(() => newlyDarkPixels(beforePolygon), { timeout: 10_000 }).toBeGreaterThan(100);
});
