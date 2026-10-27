import { useEffect, useRef } from 'react';
import { useInterval } from 'usehooks-ts';
import { WorldCanvas } from '@/features/world/components/WorldCanvas.tsx';
import { Hud } from '@/features/navigation/components/Hud.tsx';
import { BoothDrawer } from '@/features/booths/components/BoothDrawer.tsx';
import { MiniMap } from '@/features/presence/components/MiniMap.tsx';
import { RoomSearch } from '@/features/navigation/components/RoomSearch.tsx';
import { openPresenceSocket, type PresenceHandle } from '@/features/presence/api/ws.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { avatarRuntime } from '@/features/viewer/model/avatar-runtime.ts';
import { useActiveLayout } from '@/features/building/model/active-layout.ts';
import { rememberFloor, rememberMode } from '@/features/navigation/model/wayfinding-preferences.ts';
import { configuredEventId } from '@/app/config/constants.ts';
import { reportTelemetry } from '@/features/venue/model/venue-client.ts';
import { RoutePlanner } from '@/features/navigation/components/RoutePlanner.tsx';
import { TouchJoystick } from '@/features/navigation/components/TouchJoystick.tsx';
import { VenuePublicProvider } from '@/features/venue/components/VenuePublicProvider.tsx';

const PRESENCE_SEND_MS = 60;
const PRESENCE_TIMEOUT_MS = 5_000;

export function WorldPage() {
  const presence = useRef<PresenceHandle | null>(null);
  const lastSeen = useRef(new Map<string, number>());
  const lastSent = useRef({ text: '', at: 0 });
  const layout = useActiveLayout();

  useEffect(
    () =>
      useWorldStore.subscribe((state, previous) => {
        if (state.currentFloorId !== previous.currentFloorId) {
          rememberFloor(layout, state.currentFloorId);
        }
        if (state.walkMode !== previous.walkMode) {
          rememberMode(layout, state.walkMode ? 'walk' : 'orbit');
        }
      }),
    [layout],
  );

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
      const text = JSON.stringify(avatarRuntime.snapshot(useWorldStore.getState().localAvatar));
      const now = Date.now();
      if (text === lastSent.current.text && now - lastSent.current.at < 1000) {
        return;
      }
      socket.send(text);
      lastSent.current = { text, at: now };
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

  // Aggregate dwell while the venue is visible; recorded per active session.
  useInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      reportTelemetry(configuredEventId(), [{ kind: 'dwell', durationSeconds: 60 }]);
    }
  }, 60_000);

  return (
    <main className="relative min-h-0 flex-1">
      <VenuePublicProvider>
        <WorldCanvas />
        <Hud />
        <BoothDrawer />
        <MiniMap />
        <RoomSearch />
        <RoutePlanner />
        <TouchJoystick />
      </VenuePublicProvider>
    </main>
  );
}
