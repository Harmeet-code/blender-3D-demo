import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { registerMediaRoutes } from '../modules/media/routes.ts';
import {
  buildingLayoutSchema,
  avatarStateSchema,
} from '../../features/building/model/building-schema.ts';
import { loadServerEnv } from '../shared/config/env.ts';
import { baseLoggerOptions } from '../shared/logger/logger.ts';
import { createDatabase } from '../infrastructure/database/postgres.ts';
import { createRedis } from '../infrastructure/cache/redis.ts';
import { registerInfra } from './plugins/infra.ts';
import { registerHealthRoutes } from '../modules/health/routes.ts';
import { registerLayoutRoutes } from '../modules/layouts/routes.ts';
import { registerBoothRoutes } from '../modules/booths/routes.ts';
import { createDemoBoothRepository } from '../modules/booths/repository/demo.ts';
import { createSqlBoothRepository } from '../modules/booths/repository/sql.ts';
import { registerOrderRoutes } from '../modules/orders/routes.ts';
import { registerRealtimeHub } from '../modules/presence/hub.ts';
import { registerVenueRoutes, registerVenueGuard } from '../modules/venue/routes.ts';

export function buildServer(): FastifyInstance {
  const env = loadServerEnv();
  const database = createDatabase(env.DATABASE_URL);
  // Fastify treats a numeric trustProxy value as fail-closed; use its callback
  // form to apply the configured hop count after Compose constrains the peer.
  const trustProxy =
    env.TRUST_PROXY_HOPS === 0
      ? false
      : (_address: string, hop: number) => hop < env.TRUST_PROXY_HOPS;
  const app = Fastify({ logger: baseLoggerOptions(), trustProxy, bodyLimit: 12 * 1024 * 1024 });
  app.decorate('serverMode', env.NODE_ENV);
  registerVenueGuard(app);

  void app.register(cors, {
    origin: env.CORS_ORIGIN === 'true' ? true : env.CORS_ORIGIN,
    exposedHeaders: ['X-Venue-Version'],
  });
  void app.register(websocket);
  void app.register(registerInfra, {
    database,
    redis: createRedis(env.REDIS_URL),
  });

  // Shared zod schemas double as contract tests for layout + avatar payloads.
  void app.decorate('schemas', { buildingLayoutSchema, avatarStateSchema });

  void app.register(registerHealthRoutes, { prefix: '/api' });
  void app.register(registerVenueRoutes, { prefix: '/api/venue' });
  void app.register(registerLayoutRoutes, { prefix: '/api/events' });
  void app.register(registerMediaRoutes, { prefix: '/api' });
  void app.register(registerBoothRoutes, {
    prefix: '/api/events',
    repository: database ? createSqlBoothRepository(database.db) : createDemoBoothRepository(),
  });
  void app.register(registerOrderRoutes, { prefix: '/api/events' });
  void app.register(registerRealtimeHub, { prefix: '/ws' });

  return app;
}
