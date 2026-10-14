import type { FastifyInstance } from 'fastify';
import { replyResult } from '../../shared/result/http.ts';
import { getLayout, saveLayout, getLayoutDraft, saveLayoutDraft } from './service.ts';
import { buildingLayoutSchema } from '../../../features/building/model/building-schema.ts';
import {
  authStatus,
  privateDraft,
  publicLayoutSnapshot,
  writeLayout,
  VenueError,
} from '../venue/store.ts';
import { venueToken } from '../venue/routes.ts';
import { z } from 'zod';

export async function registerLayoutRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { eventId: string } }>('/:eventId/layout/draft', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    if ((await authStatus()).configured) {
      try {
        return reply.send(await privateDraft(venueToken(request), request.params.eventId));
      } catch (error) {
        if (error instanceof VenueError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    }
    return replyResult(reply, await getLayoutDraft(request.params.eventId, app.db));
  });
  app.put<{ Params: { eventId: string } }>('/:eventId/layout/draft', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    if ((await authStatus()).configured) {
      try {
        await writeLayout(
          venueToken(request),
          request.params.eventId,
          buildingLayoutSchema.parse(request.body),
          true,
        );
        return { saved: true };
      } catch (error) {
        if (error instanceof VenueError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        if (error instanceof z.ZodError) {
          return reply.code(422).send({ message: 'Invalid layout document.' });
        }
        throw error;
      }
    }
    return replyResult(reply, await saveLayoutDraft(request.params.eventId, request.body, app.db));
  });
  app.get<{ Params: { eventId: string } }>('/:eventId/layout', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const snapshot = await publicLayoutSnapshot(request.params.eventId);
    if (snapshot.layout) {
      return reply.header('X-Venue-Version', String(snapshot.version)).send(snapshot.layout);
    }
    if (snapshot.managed) {
      return reply.code(404).send({ message: 'Published layout not found.' });
    }
    const result = await getLayout(request.params.eventId, app.db);
    if (result.isOk()) {
      reply.header('X-Venue-Version', String(snapshot.version));
    }
    return replyResult(reply, result);
  });

  app.put<{ Params: { eventId: string } }>('/:eventId/layout', async (request, reply) => {
    if ((await authStatus()).configured) {
      try {
        const revision = request.headers['x-venue-version'];
        if (typeof revision !== 'string' || !/^\d+$/.test(revision)) {
          return reply
            .code(428)
            .send({ message: 'Publication requires the version loaded by your editor.' });
        }
        await writeLayout(
          venueToken(request),
          request.params.eventId,
          buildingLayoutSchema.parse(request.body),
          false,
          Number(revision),
        );
        return { saved: true };
      } catch (error) {
        if (error instanceof VenueError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }
        if (error instanceof z.ZodError) {
          return reply.code(422).send({ message: 'Invalid layout document.' });
        }
        throw error;
      }
    }
    return replyResult(reply, await saveLayout(request.params.eventId, request.body, app.db));
  });
}
