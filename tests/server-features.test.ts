import { describe, expect, test } from 'bun:test';
import Fastify from 'fastify';
import { buildServer } from '../src/server/app.ts';
import { registerBoothRoutes } from '../src/server/features/booths/routes.ts';
import type { BoothAddOnId } from '../src/frontend/entities/building/model/building-schema.ts';
import type { BoothSummary, Reservation } from '../src/frontend/entities/booth/api/dto.ts';
import type { BoothRepository } from '../src/server/features/booths/repository.ts';

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
    const booths = await app.inject({
      method: 'GET',
      url: '/api/events/convention-center-01/booths',
    });
    expect(booths.statusCode).toBe(200);
    expect(booths.json<Array<{ id: string; status: string }>>()).toEqual([
      { id: 'room-101', status: 'available' },
    ]);

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

  test('POST reserve rate limits requests per event and client IP', async () => {
    const previousTrustProxyHops = process.env['TRUST_PROXY_HOPS'];
    process.env['TRUST_PROXY_HOPS'] = '0';
    const app = buildServer();
    if (previousTrustProxyHops === undefined) {
      delete process.env['TRUST_PROXY_HOPS'];
    } else {
      process.env['TRUST_PROXY_HOPS'] = previousTrustProxyHops;
    }
    const url = '/api/events/rate-limit-event/booths/reserve';

    for (let request = 0; request < 10; request++) {
      const response = await app.inject({
        method: 'POST',
        url,
        payload: { boothId: 'room-101' },
      });
      expect(response.statusCode).toBe(200);
    }

    const limited = await app.inject({
      method: 'POST',
      url,
      payload: { boothId: 'room-101' },
      headers: { 'x-forwarded-for': '198.51.100.14' },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toMatch(/^\d+$/);
    expect(limited.json()).toMatchObject({
      code: 'RATE_LIMITED',
      error: 'Reservation rate limit exceeded',
    });
    await app.close();
  });

  test('POST reserve uses the single forwarded IP when one proxy hop is trusted', async () => {
    const previousTrustProxyHops = process.env['TRUST_PROXY_HOPS'];
    process.env['TRUST_PROXY_HOPS'] = '1';
    const app = buildServer();
    if (previousTrustProxyHops === undefined) {
      delete process.env['TRUST_PROXY_HOPS'];
    } else {
      process.env['TRUST_PROXY_HOPS'] = previousTrustProxyHops;
    }
    const url = '/api/events/trusted-proxy-event/booths/reserve';
    const forwardedIp = '198.51.100.20';
    const request = (ip: string) =>
      app.inject({
        method: 'POST',
        url,
        payload: { boothId: 'room-101' },
        headers: { 'x-forwarded-for': ip },
      });

    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await request(forwardedIp)).statusCode).toBe(200);
    }
    expect((await request(forwardedIp)).statusCode).toBe(429);
    expect((await request('198.51.100.21')).statusCode).toBe(200);
    await app.close();
  });

  test('POST reserve persists one reservation and conflicts on repeat', async () => {
    let boothStatus: BoothSummary['status'] = 'available';
    const reservations: Reservation[] = [];
    const repository: BoothRepository = {
      async listForEvent() {
        return [{ id: 'room-101', status: boothStatus }];
      },
      async reserve(_eventId, boothId, addOns: readonly BoothAddOnId[]) {
        if (boothStatus !== 'available') {
          return null;
        }
        boothStatus = 'reserved';
        const reservation = {
          reserved: true,
          boothId,
          addOns: [...addOns],
          orderId: 'order-1',
        } satisfies Reservation;
        reservations.push(reservation);
        return reservation;
      },
    };
    const app = Fastify();
    app.decorate('db', null);
    app.decorate('redis', null);
    app.decorate('serverMode', 'test');
    await app.register(registerBoothRoutes, {
      prefix: '/api/events',
      repository,
    });

    const request = () =>
      app.inject({
        method: 'POST',
        url: '/api/events/transaction-event/booths/reserve',
        payload: { boothId: 'room-101', addOns: ['chair'] },
      });
    const first = await request();
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ reserved: true, boothId: 'room-101' });
    expect((await repository.listForEvent('transaction-event'))[0]?.status).toBe('reserved');
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({ orderId: 'order-1', addOns: ['chair'] });

    const second = await request();
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('CONFLICT');
    expect(reservations).toHaveLength(1);
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
