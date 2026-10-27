import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { venueCommandSchema } from '../../../features/venue/model/venue-contracts.ts';
import {
  authorize,
  authStatus,
  bootstrap,
  command,
  eventList,
  getSnapshot,
  login,
  logout,
  publicSignage,
  publicVersion,
  publicView,
  telemetry,
  VenueError,
} from './store.ts';
import {
  isFloorPlanBuilderLayoutWrite,
  isFloorPlanBuilderMediaUpload,
} from '../../../features/building/api/builder-layout-policy.ts';

export function venueToken(request: FastifyRequest): string | undefined {
  const value = request.headers.authorization;
  return value?.startsWith('Bearer ') ? value.slice(7) : undefined;
}
function loopback(request: FastifyRequest): boolean {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? '');
}
function trustedOrigin(request: FastifyRequest): boolean {
  const { origin } = request.headers;
  if (!origin) {
    return true;
  }
  const configured = process.env.CORS_ORIGIN;
  if (configured && configured !== 'true') {
    return origin === configured;
  }
  try {
    const url = new URL(origin);
    return (
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      ['5173', '5175', '4173', '4175', '8000'].includes(url.port)
    );
  } catch {
    return false;
  }
}
/** The local builder may run on a dynamically assigned dev-server port. Keep its origin local. */
function trustedBuilderOrigin(request: FastifyRequest): boolean {
  const { origin } = request.headers;
  if (!origin) {
    return false;
  }
  try {
    const url = new URL(origin);
    return (
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
const credentials = z.object({
  name: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(200),
});
const rateWindowMs = 60_000;
const maxRateLimitKeys = 10_000;
type RateLimitEntry = { started: number; count: number };
const authAttempts = new Map<string, RateLimitEntry>();
const telemetryAttempts = new Map<string, RateLimitEntry>();
function admit(
  request: FastifyRequest,
  reply: FastifyReply,
  attempts: Map<string, RateLimitEntry>,
  limit: number,
  message: string,
): void {
  const now = Date.now();
  const key = request.ip;
  for (const [ip, item] of attempts) {
    if (now - item.started >= rateWindowMs) {
      attempts.delete(ip);
    }
  }
  const previous = attempts.get(key);
  const entry = previous ?? { started: now, count: 0 };
  entry.count += 1;
  // Refresh insertion order so over-capacity eviction removes the least-recently
  // used active IP while keeping memory bounded under rotating source addresses.
  attempts.delete(key);
  attempts.set(key, entry);
  while (attempts.size > maxRateLimitKeys) {
    const oldest = attempts.keys().next().value as string | undefined;
    if (!oldest) {
      break;
    }
    attempts.delete(oldest);
  }
  const resetSeconds = Math.max(1, Math.ceil((entry.started + rateWindowMs - now) / 1000));
  reply
    .header('RateLimit-Limit', String(limit))
    .header('RateLimit-Remaining', String(Math.max(0, limit - entry.count)))
    .header('RateLimit-Reset', String(resetSeconds));
  if (entry.count > limit) {
    reply.header('Retry-After', String(resetSeconds));
    throw new VenueError(429, message);
  }
}
/** All legacy mutations become authenticated when Venue OS is bootstrapped. */
export function registerVenueGuard(app: FastifyInstance): void {
  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    const { method } = request;
    if (path.startsWith('/api/venue')) {
      return;
    }
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return;
    }
    // The active floor-plan builder has an implicit local-admin policy for its
    // layout document endpoints. Vite may choose a dynamic port when its default
    // is occupied, so validate loopback host + request peer rather than a port list.
    if (
      (isFloorPlanBuilderLayoutWrite(method, path, request.headers) ||
        isFloorPlanBuilderMediaUpload(method, path, request.headers)) &&
      loopback(request) &&
      trustedBuilderOrigin(request)
    ) {
      return;
    }
    if (!trustedOrigin(request)) {
      return reply.code(403).send({ message: 'Untrusted application origin.' });
    }
    const { configured } = await authStatus();
    if (!configured) {
      if (app.serverMode === 'production' || !loopback(request)) {
        return reply
          .code(403)
          .send({ message: 'Configure Venue OS administration before exposing write APIs.' });
      }
      return;
    }
    try {
      const event = /^\/api\/events\/([^/]+)/.exec(path)?.[1];
      if (path.endsWith('/booths/reserve')) {
        return reply.code(409).send({
          message: 'Use Venue OS expiring holds and bookings for this managed application.',
        });
      }
      await authorize(
        venueToken(request),
        event ? decodeURIComponent(event) : '',
        path === '/api/media' ? ['admin', 'organizer', 'exhibitor'] : ['admin', 'organizer'],
      );
    } catch (error) {
      if (error instanceof VenueError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }
      throw error;
    }
  });
}
export async function registerVenueRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (['POST', 'PUT', 'DELETE'].includes(request.method) && !trustedOrigin(request)) {
      return reply.code(403).send({ message: 'Untrusted application origin.' });
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof VenueError) {
      return reply.code(error.statusCode).send({ message: error.message });
    }
    if (error instanceof z.ZodError) {
      return reply
        .code(422)
        .send({ message: error.issues.map((issue) => issue.message).join('; ') });
    }
    app.log.error({ err: error }, 'Venue operation failed');
    return reply
      .code(500)
      .send({ message: 'Venue storage operation failed. No success was reported.' });
  });
  app.get('/auth/status', async (request) => ({
    ...(await authStatus()),
    bootstrapAllowed:
      app.serverMode !== 'production' && loopback(request) && trustedOrigin(request),
  }));
  app.post('/auth/bootstrap', async (request, reply) => {
    if (app.serverMode === 'production' || !loopback(request) || !trustedOrigin(request)) {
      throw new VenueError(
        403,
        'First administrator setup is available only on the local development server. Bootstrap locally before production.',
      );
    }
    admit(request, reply, authAttempts, 10, 'Too many sign-in attempts. Wait one minute.');
    const input = credentials.parse(request.body);
    return bootstrap(input.name, input.password);
  });
  app.post('/auth/login', async (request, reply) => {
    admit(request, reply, authAttempts, 10, 'Too many sign-in attempts. Wait one minute.');
    const input = credentials.parse(request.body);
    return login(input.name, input.password);
  });
  app.post('/auth/logout', async (request) => {
    await logout(venueToken(request));
    return { signedOut: true };
  });
  app.get('/events', async (request) => eventList(venueToken(request)));
  app.get<{ Params: { eventId: string } }>('/events/:eventId/version', async (request) => ({
    version: await publicVersion(request.params.eventId),
  }));
  app.get<{ Params: { eventId: string } }>('/events/:eventId/public', async (request) =>
    publicView(request.params.eventId),
  );
  app.post<{ Params: { eventId: string } }>(
    '/events/:eventId/telemetry',
    async (request, reply) => {
      admit(request, reply, telemetryAttempts, 10, 'Too many telemetry batches. Wait one minute.');
      const input = z
        .object({
          items: z
            .array(
              z.object({
                kind: z.enum(['search', 'route', 'dwell']),
                durationSeconds: z.number().nonnegative().max(600).optional(),
              }),
            )
            .max(50),
        })
        .parse(request.body);
      return telemetry(request.params.eventId, input.items);
    },
  );
  app.get<{ Params: { eventId: string } }>('/events/:eventId', async (request) =>
    getSnapshot(venueToken(request), request.params.eventId),
  );
  app.get<{ Params: { eventId: string } }>('/events/:eventId/signage', async (request) =>
    publicSignage(request.params.eventId),
  );
  app.post<{ Params: { eventId: string } }>('/events/:eventId/commands', async (request) =>
    command(venueToken(request), request.params.eventId, venueCommandSchema.parse(request.body)),
  );
}
