import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { DatabaseConnection } from '../db/postgres.ts';
import type { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseConnection['db'] | null;
    redis: Redis | null;
  }
}

/**
 * Decorates the instance with shared infra clients + graceful shutdown.
 * Wrapped in fastify-plugin so sibling route plugins see the decorations.
 */
export const registerInfra = fp(
  async (
    app: FastifyInstance,
    deps: { database: DatabaseConnection | null; redis: Redis | null },
  ): Promise<void> => {
    app.decorate('db', deps.database?.db ?? null);
    app.decorate('redis', deps.redis);

    app.addHook('onClose', async () => {
      const disposals = await Promise.allSettled([
        deps.database?.close(),
        (async () => {
          if (!deps.redis || deps.redis.status === 'end') {
            return;
          }
          if (deps.redis.status === 'wait') {
            deps.redis.disconnect();
            return;
          }
          await deps.redis.quit();
        })(),
      ]);
      for (const [index, disposal] of disposals.entries()) {
        if (disposal.status === 'rejected') {
          app.log.error(
            { err: disposal.reason, resource: index === 0 ? 'postgres' : 'redis' },
            'Failed to dispose server resource during shutdown.',
          );
        }
      }
    });
  },
);
