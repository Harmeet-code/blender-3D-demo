import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { Sql } from '../db/postgres.ts';
import type { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    sql: Sql | null;
    redis: Redis | null;
  }
}

/**
 * Decorates the instance with shared infra clients + graceful shutdown.
 * Wrapped in fastify-plugin so sibling route plugins see the decorations.
 */
export const registerInfra = fp(
  async (app: FastifyInstance, deps: { sql: Sql | null; redis: Redis | null }): Promise<void> => {
    app.decorate('sql', deps.sql);
    app.decorate('redis', deps.redis);

    app.addHook('onClose', async () => {
      try {
        await deps.sql?.end({ timeout: 5 });
      } catch {
        // Best-effort shutdown.
      }
      try {
        deps.redis?.disconnect();
      } catch {
        // Best-effort shutdown.
      }
    });
  },
);
