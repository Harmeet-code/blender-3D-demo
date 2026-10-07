import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import {
  buildingLayoutSchema,
  avatarStateSchema,
} from '../frontend/entities/building/model/building-schema.ts';
import { loadServerEnv } from './shared/config/env.ts';
import { baseLoggerOptions } from './shared/logger/logger.ts';
import { createDatabase } from './shared/db/postgres.ts';
import { createRedis } from './shared/redis/redis.ts';
import { registerInfra } from './shared/plugins/infra.ts';
import { registerHealthRoutes } from './features/health/routes.ts';
import { registerLayoutRoutes } from './features/layouts/routes.ts';
import { registerBoothRoutes } from './features/booths/routes.ts';
import { createDemoBoothRepository } from './features/booths/repository/demo.ts';
import { createSqlBoothRepository } from './features/booths/repository/sql.ts';
import { registerOrderRoutes } from './features/orders/routes.ts';
import { registerRealtimeHub } from './features/presence/hub.ts';

export function buildServer(): FastifyInstance {
  const env = loadServerEnv();
  const database = createDatabase(env.DATABASE_URL);
  // Fastify treats a numeric trustProxy value as fail-closed; use its callback
  // form to apply the configured hop count after Compose constrains the peer.
  const trustProxy =
    env.TRUST_PROXY_HOPS === 0
      ? false
      : (_address: string, hop: number) => hop < env.TRUST_PROXY_HOPS;
  const app = Fastify({ logger: baseLoggerOptions(), trustProxy });
  app.decorate('serverMode', env.NODE_ENV);

  void app.register(cors, { origin: env.CORS_ORIGIN === 'true' ? true : env.CORS_ORIGIN });
  void app.register(websocket);
  void app.register(registerInfra, {
    database,
    redis: createRedis(env.REDIS_URL),
  });

  // Shared zod schemas double as contract tests for layout + avatar payloads.
  void app.decorate('schemas', { buildingLayoutSchema, avatarStateSchema });

  void app.register(registerHealthRoutes, { prefix: '/api' });
  void app.register(registerLayoutRoutes, { prefix: '/api/events' });
  void app.register(registerBoothRoutes, {
    prefix: '/api/events',
    repository: database ? createSqlBoothRepository(database.db) : createDemoBoothRepository(),
  });
  void app.register(registerOrderRoutes, { prefix: '/api/events' });
  void app.register(registerRealtimeHub, { prefix: '/ws' });

  return app;
}
