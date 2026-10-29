import { expect, test } from '@playwright/test';

const eventId = 'codex-render-benchmark-only';

function makeLayout() {
  const floorId = 'benchmark-floor';
  const columns = 20;
  const rows = 20;
  const rooms = Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = -58 + column * 5.8;
    const z = -58 + row * 5.8;
    const width = 4.7;
    const depth = 4.7;
    return {
      id: `benchmark-booth-${String(index + 1).padStart(3, '0')}`,
      floorId,
      label: `B-${index + 1}`,
      type: 'booth',
      price: 250 + (index % 20) * 25,
      polygon: [
        [x, z],
        [x + width, z],
        [x + width, z + depth],
        [x, z + depth],
      ],
    };
  });
  const itemTypes = ['bench', 'table', 'chair'] as const;
  const instances = Array.from({ length: 100 }, (_, index) => {
    const booth = rooms[index]!;
    const centerX = (booth.polygon[0]![0]! + booth.polygon[2]![0]!) / 2;
    const centerZ = (booth.polygon[0]![1]! + booth.polygon[2]![1]!) / 2;
    const recipe = itemTypes[index % itemTypes.length]!;
    const dimensions =
      recipe === 'bench'
        ? [1.5, 0.9, 0.55]
        : recipe === 'table'
          ? [1.1, 0.8, 0.8]
          : [0.55, 0.9, 0.55];
    const id = `benchmark-item-${String(index + 1).padStart(3, '0')}`;
    const data = {
      id,
      recipe,
      name: `${recipe} ${index + 1}`,
      managed: true,
      position: [centerX, centerZ],
      yawRadians: (index % 4) * (Math.PI / 2),
      scale: [1, 1, 1],
      dimensions,
      collidable: false,
      polygon: [
        [-dimensions[0]! / 2, -dimensions[2]! / 2],
        [dimensions[0]! / 2, -dimensions[2]! / 2],
        [dimensions[0]! / 2, dimensions[2]! / 2],
        [-dimensions[0]! / 2, dimensions[2]! / 2],
      ],
    };
    return {
      id,
      assetId: `fpb:v1:${encodeURIComponent(JSON.stringify(data))}`,
      position: [centerX, centerZ],
      yawRadians: data.yawRadians,
      scale: [1, 1, 1],
      dimensions,
      collidable: false,
    };
  });
  return {
    schemaVersion: 2,
    buildingId: eventId,
    floors: [
      {
        id: floorId,
        name: 'Benchmark Hall',
        heightOffset: 0,
        image: '',
        coordinateSystem: { units: 'meters' },
        authoring: {
          boundary: [
            [-62, -62],
            [62, -62],
            [62, 62],
            [-62, 62],
          ],
          obstacles: [],
          spawn: [0, 0],
          instances,
        },
      },
    ],
    rooms,
    portals: [],
  };
}

test('records active authoring canvas responsiveness with 400 booths and 100 items in an isolated event', async ({
  page,
}, testInfo) => {
  const layout = makeLayout();
  const intercepted: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/events/codex-render-benchmark-only/layout**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    intercepted.push(`${route.request().method()} ${pathname}`);
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 200, json: { saved: true } });
      return;
    }
    await route.fulfill({ status: 200, json: pathname.endsWith('/draft') ? null : layout });
  });

  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?eventId=${eventId}`);
  try {
    await expect(page.getByTestId('floor-plan-studio')).toBeVisible({ timeout: 15_000 });
  } catch {
    const body = await page.locator('body').innerText();
    throw new Error(`Authoring app did not open. Body: ${body}\nPage errors: ${pageErrors.join('\n')}`);
  }
  await expect(page.getByTestId('floor-plan-viewport')).toBeVisible();
  await expect(page.locator('canvas[data-plan-canvas="true"]')).toBeVisible();
  await expect(page.getByText('500 objects · 0 areas')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /Preparing|Opening/ })).toHaveCount(0);

  const viewport = await page.getByTestId('floor-plan-viewport').boundingBox();
  expect(viewport).not.toBeNull();
  const centerX = viewport!.x + viewport!.width / 2;
  const centerY = viewport!.y + viewport!.height / 2;
  const measurement = page.evaluate(async () => {
    const intervals: number[] = [];
    let last = performance.now();
    let running = true;
    const sample = (now: number) => {
      intervals.push(now - last);
      last = now;
      if (running) {requestAnimationFrame(sample);}
    };
    requestAnimationFrame(sample);
    await new Promise((resolve) => setTimeout(resolve, 1300));
    running = false;
    const sorted = [...intervals].sort((a, b) => a - b);
    const percentile = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
    return {
      frames: intervals.length,
      elapsedMs: intervals.reduce((sum, value) => sum + value, 0),
      medianIntervalMs: percentile(0.5),
      p95IntervalMs: percentile(0.95),
      maxIntervalMs: Math.max(0, ...intervals),
      over32ms: intervals.filter((value) => value > 32).length,
    };
  });
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  for (let step = 1; step <= 12; step++) {
    await page.mouse.move(centerX + step * 9, centerY + step * 2, { steps: 1 });
  }
  await page.mouse.up();
  const stats = await measurement;

  await page.screenshot({ path: testInfo.outputPath('400-booth-100-item-authoring.png'), fullPage: false });
  await testInfo.attach('400-booth-100-item-render-metrics.json', {
    body: Buffer.from(JSON.stringify({
      eventId,
      isolatedFixture: true,
      viewport: { width: 1440, height: 900 },
      scene: { booths: layout.rooms.length, floors: 1, extraItems: layout.floors[0]!.authoring!.instances.length },
      interaction: '12 pointer-move orbit steps over 1.3 seconds',
      environment: {
        browser: testInfo.project.name,
        platform: process.platform,
        devicePixelRatio: await page.evaluate(() => window.devicePixelRatio),
      },
      apiIntercepts: intercepted,
      stats,
      note: 'Browser requestAnimationFrame intervals include compositor/main-thread work and are not a GPU-only FPS measurement.',
    }, null, 2)),
    contentType: 'application/json',
  });
  expect(intercepted.every((request) => request.includes(eventId))).toBe(true);
  expect(stats.frames).toBeGreaterThan(0);
});
