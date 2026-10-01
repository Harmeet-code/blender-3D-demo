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
  app.get('/avatars', { websocket: true }, (socket) => {
    let subscriber: ReturnType<NonNullable<FastifyInstance['redis']>['duplicate']> | null = null;

    const closeSubscriber = (): void => {
      try {
        void subscriber?.unsubscribe(PRESENCE_CHANNEL);
        subscriber?.disconnect();
      } catch {
        // Best-effort teardown.
      } finally {
        subscriber = null;
      }
    };

    if (app.redis) {
      try {
        subscriber = app.redis.duplicate();
        void subscriber
          .connect()
          .then(() =>
            subscriber?.subscribe(PRESENCE_CHANNEL, (_channel, message) => {
              try {
                socket.send(message);
              } catch {
                // Socket already gone; close handler cleans up.
              }
            }),
          )
          .catch(() => {
            subscriber = null;
          });
      } catch {
        subscriber = null;
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
      closeSubscriber();
    });
  });
}
