import { describe, expect, test } from 'bun:test';
import Fastify from 'fastify';
import { buildServer } from '../src/server/app.ts';
import { registerBoothRoutes } from '../src/server/features/booths/routes.ts';
import type { Sql } from '../src/server/shared/db/postgres.ts';

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

  test('POST reserve rate limits requests per event and client IP', async () => {
    const app = buildServer();
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

  test('POST reserve transaction inserts one pending order and conflicts on repeat', async () => {
    let boothStatus = 'available';
    const orders: Array<Record<string, unknown>> = [];
    const transactionStatements: string[] = [];
    let transactionCount = 0;
    const tx = Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const statement = strings.join('?').trim();
        transactionStatements.push(statement);
        if (statement.startsWith('update rooms')) {
          if (boothStatus !== 'available') {
            return Promise.resolve([]);
          }
          boothStatus = 'reserved';
          return Promise.resolve([{ id: 'room-101' }]);
        }
        if (statement.startsWith('insert into orders')) {
          orders.push({ statement, values });
          return Promise.resolve([]);
        }
        throw new Error(`Unexpected SQL: ${statement}`);
      },
      { json: (value: unknown) => JSON.stringify(value) },
    );
    const sql = Object.assign(() => Promise.resolve([]), {
      begin: async <T>(run: (transaction: typeof tx) => Promise<T>) => {
        transactionCount++;
        return run(tx);
      },
      json: (value: unknown) => JSON.stringify(value),
    }) as unknown as Sql;
    const app = Fastify();
    app.decorate('sql', sql);
    app.decorate('redis', null);
    await app.register(registerBoothRoutes, { prefix: '/api/events' });

    const request = () =>
      app.inject({
        method: 'POST',
        url: '/api/events/transaction-event/booths/reserve',
        payload: { boothId: 'room-101', addOns: ['chair'] },
      });
    const first = await request();
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ reserved: true, boothId: 'room-101' });
    expect(boothStatus).toBe('reserved');
    expect(orders).toHaveLength(1);
    expect(orders[0]?.['statement']).toContain("'pending'");
    expect(transactionCount).toBe(1);
    expect(transactionStatements).toHaveLength(2);
    expect(transactionStatements[1]).toStartWith('insert into orders');

    const second = await request();
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('CONFLICT');
    expect(orders).toHaveLength(1);
    expect(transactionCount).toBe(2);
    expect(transactionStatements).toHaveLength(3);
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
