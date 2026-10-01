import type { FastifyInstance } from 'fastify';
import { avatarStateSchema } from '../../../entities/building/model/building-schema.ts';

/**
 * Phase 5 stub: clients publish AvatarState at 15-20 Hz,
 * server rebroadcasts; clients lerp at 60 FPS.
 */
export async function registerRealtimeHub(app: FastifyInstance): Promise<void> {
  app.get('/avatars', { websocket: true }, (socket) => {
    socket.on('message', (raw) => {
      try {
        const parsed = avatarStateSchema.parse(JSON.parse(String(raw)));
        socket.send(JSON.stringify({ type: 'avatar', ...parsed }));
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'invalid avatar payload' }));
      }
    });
  });
}
