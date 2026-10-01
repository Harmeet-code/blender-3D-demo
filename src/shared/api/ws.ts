import type { AvatarState } from '../../entities/building/model/building-schema.ts';

/** WebSocket URL for avatar presence. Falls back to same-origin `/ws/avatars`. */
export function presenceWsUrl(): string {
  const configured = import.meta.env['VITE_WS_URL'];
  if (configured) {
    return configured;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws/avatars`;
}

/** Open the presence socket. Caller throttles sends to 15-20 Hz. */
export function openPresenceSocket(onAvatar: (avatar: AvatarState) => void): WebSocket {
  const socket = new WebSocket(presenceWsUrl());
  socket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(String(event.data)) as AvatarState & { type?: string };
      if (data.type === 'avatar' || data.id) {
        onAvatar(data);
      }
    } catch {
      // Ignore malformed presence frames; hub already validates server-side.
    }
  });
  return socket;
}
