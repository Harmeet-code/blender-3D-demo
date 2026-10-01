import type { FastifyInstance } from 'fastify';
import { demoLayout } from '../../../entities/building/model/building-schema.ts';

export async function registerLayoutRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:eventId/layout', () => demoLayout);
  app.put<{ Params: { eventId: string } }>('/:eventId/layout', (request) => ({
    saved: true,
    eventId: request.params.eventId,
  }));
}
