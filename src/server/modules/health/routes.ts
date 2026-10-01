import type { FastifyInstance } from 'fastify';

type DepStatus = 'up' | 'down' | 'unconfigured';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('health check timed out'));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/** Liveness + dependency status. Always 200: deps report `down`, never throw. */
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    let postgres: DepStatus = 'unconfigured';
    let redis: DepStatus = 'unconfigured';

    if (app.sql) {
      try {
        await withTimeout(app.sql`select 1 as one`, 1000);
        postgres = 'up';
      } catch {
        postgres = 'down';
      }
    }

    if (app.redis) {
      try {
        await withTimeout(app.redis.ping(), 1000);
        redis = 'up';
      } catch {
        redis = 'down';
      }
    }

    return {
      ok: true,
      uptime: process.uptime(),
      deps: { postgres, redis },
    };
  });
}
