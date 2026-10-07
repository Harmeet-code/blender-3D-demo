import { describe, expect, test } from 'bun:test';
import Fastify from 'fastify';
import { buildServer } from '../src/server/app.ts';
import { registerInfra } from '../src/server/shared/plugins/infra.ts';
import type { Database, DatabaseConnection } from '../src/server/shared/db/postgres.ts';

describe('infra health', () => {
  test('GET /api/health reports dependency status without throwing', async () => {
    const app = buildServer();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      deps: { postgres: string; redis: string };
    };
    expect(body.ok).toBe(true);
    expect(['up', 'down', 'unconfigured']).toContain(body.deps.postgres);
    expect(['up', 'down', 'unconfigured']).toContain(body.deps.redis);
    await app.close();
  });

  test('server close disposes the database and a lazy Redis client', async () => {
    let databaseClosed = 0;
    let redisDisconnected = 0;
    const database: DatabaseConnection = {
      db: null as unknown as Database,
      close: async () => {
        databaseClosed++;
      },
    };
    const redis = {
      status: 'wait',
      disconnect: () => {
        redisDisconnected++;
      },
    };
    const app = Fastify();
    await app.register(registerInfra, { database, redis: redis as never });
    await app.close();

    expect(databaseClosed).toBe(1);
    expect(redisDisconnected).toBe(1);
  });
});
