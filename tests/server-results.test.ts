import { describe, expect, test } from 'bun:test';
import Fastify from 'fastify';
import { createBoothService } from '../src/server/features/booths/service.ts';
import { createDemoBoothRepository } from '../src/server/features/booths/repository/demo.ts';
import { saveLayout } from '../src/server/features/layouts/service.ts';
import { parsePresenceFrame } from '../src/server/features/presence/service.ts';
import { buildServer } from '../src/server/app.ts';
import { replyResult } from '../src/server/shared/result/http.ts';
import {
  conflictError,
  err,
  fromRepository,
  rateLimitError,
  toHttpBody,
  validationError,
} from '../src/server/shared/result/errors.ts';
import { parseRequest, validateResponse } from '../src/server/shared/result/validate.ts';
import { createReservationRateLimiter } from '../src/server/shared/plugins/rate-limit.ts';
import { orderSummarySchema } from '../src/frontend/entities/order/api/dto.ts';
import { loadServerEnv } from '../src/server/shared/config/env.ts';
import { registerBoothRoutes } from '../src/server/features/booths/routes.ts';

describe('server Result errors (no DB)', () => {
  const boothService = createBoothService(createDemoBoothRepository());

  test('reserve rejects unknown add-ons as VALIDATION err', async () => {
    const result = await boothService.reserveBooth('e', {
      boothId: 'room-101',
      addOns: ['nope'],
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.status).toBe(400);
    }
  });

  test('reserve accepts known add-ons as ok', async () => {
    const result = await boothService.reserveBooth('e', {
      boothId: 'room-101',
      addOns: ['chair'],
    });
    expect(result.isOk()).toBe(true);
  });

  test('saveLayout rejects invalid payloads as VALIDATION err', async () => {
    const result = await saveLayout('e', { buildingId: '', floors: [] }, null);
    expect(result.isErr()).toBe(true);
  });

  test('presence frame parsing rejects garbage as err', () => {
    expect(parsePresenceFrame('not-json{{{').isErr()).toBe(true);
    expect(parsePresenceFrame(JSON.stringify({ id: 'x' })).isErr()).toBe(true);
  });

  test('toHttpBody carries code + status', () => {
    const error = validationError('bad');
    const body = toHttpBody(error);
    expect(body).toMatchObject({ code: 'VALIDATION', error: 'bad' });
    expect(error).not.toBeInstanceOf(Error);
  });

  test('fromRepository funnels throws into typed INTERNAL with statement details', async () => {
    const result = await fromRepository(async () => {
      throw new Error('boom');
    }, 'Probe statement');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('INTERNAL');
      expect(result.error.status).toBe(500);
      expect(result.error.details).toMatchObject({ statement: 'Probe statement', cause: 'boom' });
    }
  });

  test('typed CONFLICT maps to 409 end to end', async () => {
    const app = buildServer();
    app.get('/probe-conflict', (_request, reply) => {
      return replyResult(reply, err(conflictError('Booth room-101 is not available')));
    });
    const res = await app.inject({ method: 'GET', url: '/probe-conflict' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'CONFLICT' });
    await app.close();
  });

  test('parseRequest accepts valid DTOs, rejects the rest as VALIDATION', () => {
    const okResult = parseRequest(
      orderSummarySchema,
      { orderId: 'o-1', status: 'pending' },
      'order payload',
    );
    expect(okResult.isOk()).toBe(true);
    const badResult = parseRequest(
      orderSummarySchema,
      { orderId: '', status: 'nope' },
      'order payload',
    );
    expect(badResult.isErr()).toBe(true);
    if (badResult.isErr()) {
      expect(badResult.error.code).toBe('VALIDATION');
    }
  });

  test('validateResponse flags contract drift as INTERNAL', () => {
    const result = validateResponse(orderSummarySchema, { orderId: 'o-1' }, 'Order o-1');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('INTERNAL');
      expect(result.error.status).toBe(500);
    }
  });

  test('typed RATE_LIMITED maps to 429 in the standard error envelope', () => {
    const error = rateLimitError();
    expect(error.status).toBe(429);
    expect(toHttpBody(error)).toMatchObject({
      code: 'RATE_LIMITED',
      error: 'Reservation rate limit exceeded',
    });
  });

  test('fallback reservation limiter allows ten requests and resets its fixed window', async () => {
    let now = 1_000;
    const limiter = createReservationRateLimiter({ now: () => now });
    for (let request = 0; request < 10; request++) {
      expect(await limiter.consume('event-a', '127.0.0.1', null)).toMatchObject({ allowed: true });
    }
    expect(await limiter.consume('event-a', '127.0.0.1', null)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(await limiter.consume('event-b', '127.0.0.1', null)).toMatchObject({ allowed: true });
    expect(await limiter.consume('event-a', '192.0.2.8', null)).toMatchObject({ allowed: true });

    now += 60_000;
    expect(await limiter.consume('event-a', '127.0.0.1', null)).toMatchObject({ allowed: true });
  });

  test('Redis reservation limiter uses one atomic fixed-window script', async () => {
    const limiter = createReservationRateLimiter();
    const calls: unknown[][] = [];
    let count = 0;
    const redis = {
      eval: async (...args: unknown[]) => {
        calls.push(args);
        return [++count, 42_000];
      },
    } as never;
    for (let request = 0; request < 10; request++) {
      expect(await limiter.consume('event-a', '127.0.0.1', redis)).toMatchObject({ allowed: true });
    }
    expect(await limiter.consume('event-a', '127.0.0.1', redis)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 42,
    });
    expect(calls).toHaveLength(11);
    expect(calls[0]?.[0]).toContain('INCR');
    expect(calls[0]?.[1]).toBe(1);
    expect(calls[0]?.[2]).toContain('event-a');
  });

  test('server mode and proxy hops have explicit development-safe defaults', () => {
    expect(loadServerEnv({}).TRUST_PROXY_HOPS).toBe(0);
    expect(loadServerEnv({}).NODE_ENV).toBe('development');
    expect(loadServerEnv({ TRUST_PROXY_HOPS: '1' }).TRUST_PROXY_HOPS).toBe(1);
    expect(loadServerEnv({ NODE_ENV: 'production' }).NODE_ENV).toBe('production');
    expect(loadServerEnv({ NODE_ENV: 'production', TRUST_PROXY_HOPS: 'bad' }).NODE_ENV).toBe(
      'production',
    );
  });

  test('Redis eval failures return the typed 503 reservation error', async () => {
    const app = Fastify();
    app.decorate('db', null);
    app.decorate('serverMode', 'test');
    app.decorate('redis', {
      eval: async () => {
        throw new Error('redis down');
      },
    } as never);
    await app.register(registerBoothRoutes, {
      prefix: '/api/events',
      repository: createDemoBoothRepository(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/events/redis-error-event/booths/reserve',
      payload: { boothId: 'room-101' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: 'UNAVAILABLE',
      error: 'Reservation rate limiter unavailable',
    });
    await app.close();
  });

  test('production reservation without Redis returns typed 503', async () => {
    const app = Fastify();
    app.decorate('db', null);
    app.decorate('redis', null);
    app.decorate('serverMode', 'production');
    await app.register(registerBoothRoutes, {
      prefix: '/api/events',
      repository: createDemoBoothRepository(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/events/missing-redis-event/booths/reserve',
      payload: { boothId: 'room-101' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: 'UNAVAILABLE',
      error: 'Reservation rate limiter requires Redis in production',
    });
    await app.close();
  });

  test('fallback capacity denial reports earliest expiry and retries after cleanup', async () => {
    let now = 1_000;
    const limiter = createReservationRateLimiter({ now: () => now, maxFallbackKeys: 2 });
    expect(await limiter.consume('event-a', '127.0.0.1', null)).toMatchObject({ allowed: true });
    now += 20_000;
    expect(await limiter.consume('event-b', '127.0.0.1', null)).toMatchObject({ allowed: true });
    now += 20_000;
    expect(await limiter.consume('capacity-denied', '127.0.0.1', null)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 20,
    });

    now += 20_000;
    expect(await limiter.consume('after-expiry', '127.0.0.1', null)).toMatchObject({
      allowed: true,
    });
  });

  test('fallback retry-after counts down to window reset', async () => {
    let now = 20_000;
    const limiter = createReservationRateLimiter({ now: () => now });
    for (let request = 0; request < 10; request++) {
      await limiter.consume('retry-event', '127.0.0.1', null);
    }
    now += 12_000;
    expect(await limiter.consume('retry-event', '127.0.0.1', null)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 48,
    });
    now += 48_000;
    expect(await limiter.consume('retry-event', '127.0.0.1', null)).toMatchObject({
      allowed: true,
    });
  });
});
