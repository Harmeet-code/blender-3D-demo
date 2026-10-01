import { describe, expect, test } from 'bun:test';
import { buildServer } from '../src/server/app.ts';

describe('server feature slices (demo fallback, no DB)', () => {
  test('GET layout returns the demo building', async () => {
    const app = buildServer();
    const res = await app.inject({ method: 'GET', url: '/api/events/convention-center-01/layout' });
    expect(res.statusCode).toBe(200);
    expect(res.json().buildingId).toBe('convention-center-01');
    await app.close();
  });

  test('PUT layout rejects invalid payloads with 400', async () => {
    const app = buildServer();
    const res = await app.inject({
      method: 'PUT',
      url: '/api/events/convention-center-01/layout',
      payload: { buildingId: '', floors: [] },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  test('POST reserve validates add-ons and returns an order', async () => {
    const app = buildServer();
    const ok = await app.inject({
      method: 'POST',
      url: '/api/events/convention-center-01/booths/reserve',
      payload: { boothId: 'room-101', addOns: ['chair'] },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ reserved: true, boothId: 'room-101' });

    const bad = await app.inject({
      method: 'POST',
      url: '/api/events/convention-center-01/booths/reserve',
      payload: { boothId: 'room-101', addOns: ['nope'] },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('VALIDATION');
    await app.close();
  });

  test('GET order falls back to pending stub without DB', async () => {
    const app = buildServer();
    const res = await app.inject({ method: 'GET', url: '/api/events/e/orders/missing' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ orderId: 'missing', status: 'pending' });
    await app.close();
  });
});
