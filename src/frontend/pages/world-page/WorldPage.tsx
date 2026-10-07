import { useEffect, useRef } from 'react';
import { useInterval } from 'usehooks-ts';
import { WorldCanvas } from '../../widgets/world-viewport/WorldCanvas.tsx';
import { Hud } from '../../features/floor-control/Hud.tsx';
import { BoothDrawer } from '../../features/booth-customize/BoothDrawer.tsx';
import { MiniMap } from '../../features/avatar-presence/MiniMap.tsx';
import { RoomSearch } from '../../features/room-teleport/RoomSearch.tsx';
import { openPresenceSocket, type PresenceHandle } from '../../shared/api/ws.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

const PRESENCE_SEND_MS = 60;
const PRESENCE_TIMEOUT_MS = 5_000;

export function WorldPage() {
  const presence = useRef<PresenceHandle | null>(null);
  const lastSeen = useRef(new Map<string, number>());

  useEffect(() => {
    const handle = openPresenceSocket({
      onAvatar: (avatar) => {
        if (avatar.id === useWorldStore.getState().localAvatar.id) {
          return;
        }
        lastSeen.current.set(avatar.id, Date.now());
        useWorldStore.getState().upsertRemoteAvatar(avatar);
      },
    });
    presence.current = handle;
    return () => {
      presence.current = null;
      handle.close();
      lastSeen.current.clear();
      useWorldStore.getState().clearRemoteAvatars();
    };
  }, []);

  useInterval(() => {
    const socket = presence.current?.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      socket.send(JSON.stringify(useWorldStore.getState().localAvatar));
    } catch {
      // Socket may close between checking readyState and sending.
    }
  }, PRESENCE_SEND_MS);

  useInterval(() => {
    const now = Date.now();
    for (const [id, seenAt] of lastSeen.current) {
      if (now - seenAt > PRESENCE_TIMEOUT_MS) {
        lastSeen.current.delete(id);
        useWorldStore.getState().removeRemoteAvatar(id);
      }
    }
  }, PRESENCE_TIMEOUT_MS);

  return (
    <main className="relative min-h-0 flex-1">
      <WorldCanvas />
      <Hud />
      <BoothDrawer />
      <MiniMap />
      <RoomSearch />
    </main>
  );
}
