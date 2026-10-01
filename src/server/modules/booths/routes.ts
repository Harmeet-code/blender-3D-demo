import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const reserveBody = z.object({
  boothId: z.string().min(1),
  addOns: z.array(z.string().min(1)).default([]),
});

export async function registerBoothRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:eventId/booths', () => [{ id: 'room-101', status: 'available' }]);
  app.post<{ Params: { eventId: string } }>('/:eventId/booths/reserve', (request) => {
    const body = reserveBody.parse(request.body);
    return { reserved: true, ...body };
  });
}
