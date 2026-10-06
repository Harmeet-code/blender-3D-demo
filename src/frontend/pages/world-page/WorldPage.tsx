import { useEffect } from 'react';
import { WorldCanvas } from '../../widgets/world-viewport/WorldCanvas.tsx';
import { Hud } from '../../features/floor-control/Hud.tsx';
import { BoothDrawer } from '../../features/booth-customize/BoothDrawer.tsx';
import { MiniMap } from '../../features/avatar-presence/MiniMap.tsx';
import { RoomSearch } from '../../features/room-teleport/RoomSearch.tsx';
import { openPresenceSocket } from '../../shared/api/ws.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

const PRESENCE_SEND_MS = 60;
const PRESENCE_TIMEOUT_MS = 5_000;

export function WorldPage() {
  useEffect(() => {
    const lastSeen = new Map<string, number>();
    const handle = openPresenceSocket({
      onAvatar: (avatar) => {
        if (avatar.id === useWorldStore.getState().localAvatar.id) {
          return;
        }
        lastSeen.set(avatar.id, Date.now());
        useWorldStore.getState().upsertRemoteAvatar(avatar);
      },
    });
    const sendTimer = window.setInterval(() => {
      if (handle.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      const localAvatar = useWorldStore.getState().localAvatar;
      try {
        handle.socket.send(JSON.stringify(localAvatar));
      } catch {
        // Socket already gone; close handler cleans up.
      }
    }, PRESENCE_SEND_MS);
    const sweepTimer = window.setInterval(() => {
      const now = Date.now();
      for (const [id, seenAt] of lastSeen) {
        if (now - seenAt > PRESENCE_TIMEOUT_MS) {
          lastSeen.delete(id);
          useWorldStore.getState().removeRemoteAvatar(id);
        }
      }
    }, PRESENCE_TIMEOUT_MS);
    return () => {
      window.clearInterval(sendTimer);
      window.clearInterval(sweepTimer);
      handle.close();
      useWorldStore.getState().clearRemoteAvatars();
    };
  }, []);

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
