import type { FastifyInstance } from 'fastify';
import { replyResult } from '../../shared/result/http.ts';
import { getLayout, saveLayout } from './service.ts';

export async function registerLayoutRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { eventId: string } }>('/:eventId/layout', async (request, reply) => {
    return replyResult(reply, await getLayout(request.params.eventId, app.db));
  });

  app.put<{ Params: { eventId: string } }>('/:eventId/layout', async (request, reply) => {
    return replyResult(reply, await saveLayout(request.params.eventId, request.body, app.db));
  });
}
