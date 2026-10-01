import { describe, expect, test } from 'bun:test';
import { buildServer } from '../src/server/app.ts';

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
});
