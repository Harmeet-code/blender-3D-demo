import type { FastifyInstance } from 'fastify';

export async function registerOrderRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:eventId/orders/:orderId', (request) => ({
    orderId: (request.params as { orderId: string }).orderId,
    status: 'pending',
  }));
}
