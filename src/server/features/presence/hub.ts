import type { FastifyInstance } from 'fastify';
import { assertNever, toHttpBody, type AppError } from '../../shared/result/errors.ts';
import { PRESENCE_CHANNEL, parsePresenceFrame, publishPresence } from './service.ts';

import type { AvatarState } from '../../../frontend/entities/building/model/building-schema.ts';

/** Exhaustive publish-failure routing: every ErrorCode has a branch. */
function sendPublishFailure(
  socket: { send: (data: string) => void },
  avatar: AvatarState,
  error: AppError,
): void {
  switch (error.code) {
    case 'UNAVAILABLE': {
      socket.send(JSON.stringify({ type: 'avatar', ...avatar }));
      break;
    }
    case 'VALIDATION':
    case 'NOT_FOUND':
    case 'CONFLICT':
    case 'RATE_LIMITED':
    case 'INTERNAL': {
      socket.send(JSON.stringify({ type: 'error', ...toHttpBody(error) }));
      break;
    }
    default: {
      socket.send(JSON.stringify({ type: 'error', ...toHttpBody(assertNever(error.code)) }));
      break;
    }
  }
}

/**
 * Avatar presence fan-out. Clients publish AvatarState at 15-20 Hz;
 * frames relay through Redis so every socket sees every peer. Without Redis
 * the hub echoes back to the sender (local-dev fallback); clients lerp at 60 FPS.
 */
export async function registerRealtimeHub(app: FastifyInstance): Promise<void> {
  type PresenceSubscriber = ReturnType<NonNullable<FastifyInstance['redis']>['duplicate']>;
  const closeSubscribers = new Set<() => Promise<void>>();

  app.addHook('onClose', async () => {
    const closed = await Promise.allSettled([...closeSubscribers].map((close) => close()));
    for (const result of closed) {
      if (result.status === 'rejected') {
        app.log.error({ err: result.reason }, 'Failed to close a presence Redis subscriber.');
      }
    }
  });

  app.get('/avatars', { websocket: true }, (socket) => {
    let subscriber: PresenceSubscriber | null = null;
    let closed = false;

    const closeSubscriber = async (): Promise<void> => {
      closed = true;
      closeSubscribers.delete(closeSubscriber);
      const active = subscriber;
      subscriber = null;
      if (!active) {
        return;
      }
      try {
        if (active.status === 'ready') {
          await active.unsubscribe(PRESENCE_CHANNEL);
        }
        if (active.status === 'wait' || active.status === 'end') {
          active.disconnect();
        } else {
          await active.quit();
        }
      } catch (cause) {
        app.log.warn({ err: cause }, 'Graceful presence subscriber shutdown failed.');
        active.disconnect();
      }
    };
    closeSubscribers.add(closeSubscriber);

    if (app.redis) {
      try {
        const active = app.redis.duplicate();
        subscriber = active;
        void active
          .connect()
          .then(async () => {
            if (closed) {
              await closeSubscriber();
              return;
            }
            await active.subscribe(PRESENCE_CHANNEL, (_channel, message) => {
              try {
                socket.send(message);
              } catch (cause) {
                app.log.debug({ err: cause }, 'Ignoring presence frame for closed socket.');
              }
            });
          })
          .catch((cause: unknown) => {
            app.log.warn({ err: cause }, 'Presence Redis subscriber connection failed.');
            if (subscriber === active) {
              void closeSubscriber();
            }
          });
      } catch (cause) {
        app.log.warn({ err: cause }, 'Could not create a presence Redis subscriber.');
      }
    }

    socket.on('message', (raw) => {
      const parsed = parsePresenceFrame(raw);
      if (parsed.isErr()) {
        socket.send(JSON.stringify({ type: 'error', ...toHttpBody(parsed.error) }));
        return;
      }
      const avatar = parsed.value;
      void publishPresence(app.redis, avatar).then((result) => {
        if (result.isOk()) {
          return;
        }
        sendPublishFailure(socket, avatar, result.error);
      });
    });

    socket.on('close', () => {
      void closeSubscriber();
    });
  });
}
