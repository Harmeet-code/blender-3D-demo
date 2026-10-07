import type { FastifyInstance } from 'fastify';
import { replyResult } from '../../shared/result/http.ts';
import { getOrder } from './service.ts';

export async function registerOrderRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { eventId: string; orderId: string } }>(
    '/:eventId/orders/:orderId',
    async (request, reply) => {
      return replyResult(
        reply,
        await getOrder(request.params.eventId, request.params.orderId, app.db),
      );
    },
  );
}
