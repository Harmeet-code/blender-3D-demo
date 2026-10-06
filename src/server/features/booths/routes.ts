import type { FastifyInstance } from 'fastify';
import { reservationRateLimiter } from '../../shared/plugins/rate-limit.ts';
import { rateLimitError, toHttpBody, unavailableError } from '../../shared/result/errors.ts';
import { replyResult } from '../../shared/result/http.ts';
import type { ServerMode } from '../../shared/config/env.ts';
import { listBooths, reserveBooth } from './service.ts';

declare module 'fastify' {
  interface FastifyInstance {
    serverMode: ServerMode;
  }
}

export async function registerBoothRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { eventId: string } }>('/:eventId/booths', async (request, reply) => {
    return replyResult(reply, await listBooths(request.params.eventId, app.sql));
  });

  app.post<{ Params: { eventId: string } }>('/:eventId/booths/reserve', async (request, reply) => {
    let limit;
    try {
      limit = await reservationRateLimiter.consume(
        request.params.eventId,
        request.ip,
        app.redis,
        app.serverMode,
      );
    } catch {
      const error = unavailableError('Reservation rate limiter unavailable');
      return reply.code(error.status).send(toHttpBody(error));
    }
    if ('unavailable' in limit) {
      const error = unavailableError('Reservation rate limiter requires Redis in production');
      return reply.code(error.status).send(toHttpBody(error));
    }
    if (!limit.allowed) {
      reply.header('Retry-After', String(limit.retryAfterSeconds));
      const error = rateLimitError();
      return reply.code(error.status).send(toHttpBody(error));
    }
    return replyResult(reply, await reserveBooth(request.params.eventId, request.body, app.sql));
  });
}
