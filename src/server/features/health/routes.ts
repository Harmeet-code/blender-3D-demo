import type { FastifyInstance } from 'fastify';
import { replyResult } from '../../shared/result/http.ts';
import { getHealth } from './service.ts';

/** Liveness + dependency status. Always 200: deps report `down`, never throw. */
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    return replyResult(reply, await getHealth(app.db, app.redis));
  });
}
