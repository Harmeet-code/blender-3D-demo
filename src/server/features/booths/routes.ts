import type { FastifyInstance } from 'fastify';
import { replyResult } from '../../shared/result/http.ts';
import { listBooths, reserveBooth } from './service.ts';

export async function registerBoothRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { eventId: string } }>('/:eventId/booths', async (request, reply) => {
    return replyResult(reply, await listBooths(request.params.eventId, app.sql));
  });

  app.post<{ Params: { eventId: string } }>('/:eventId/booths/reserve', async (request, reply) => {
    return replyResult(reply, await reserveBooth(request.params.eventId, request.body, app.sql));
  });
}
