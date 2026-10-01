import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import {
  buildingLayoutSchema,
  avatarStateSchema,
} from '../entities/building/model/building-schema.ts';
import { loadServerEnv } from './shared/config/env.ts';
import { createSql } from './shared/db/postgres.ts';
import { createRedis } from './shared/redis/redis.ts';
import { registerInfra } from './shared/plugins/infra.ts';
import { registerHealthRoutes } from './modules/health/routes.ts';
import { registerLayoutRoutes } from './modules/layouts/routes.ts';
import { registerBoothRoutes } from './modules/booths/routes.ts';
import { registerOrderRoutes } from './modules/orders/routes.ts';
import { registerRealtimeHub } from './modules/realtime/hub.ts';

export function buildServer(): FastifyInstance {
  const env = loadServerEnv();
  const app = Fastify({ logger: true });

  void app.register(cors, { origin: env.CORS_ORIGIN === 'true' ? true : env.CORS_ORIGIN });
  void app.register(websocket);
  void app.register(registerInfra, {
    sql: createSql(env.DATABASE_URL),
    redis: createRedis(env.REDIS_URL),
  });

  // Shared zod schemas double as contract tests for layout + avatar payloads.
  void app.decorate('schemas', { buildingLayoutSchema, avatarStateSchema });

  void app.register(registerHealthRoutes, { prefix: '/api' });
  void app.register(registerLayoutRoutes, { prefix: '/api/events' });
  void app.register(registerBoothRoutes, { prefix: '/api/events' });
  void app.register(registerOrderRoutes, { prefix: '/api/events' });
  void app.register(registerRealtimeHub, { prefix: '/ws' });

  return app;
}
