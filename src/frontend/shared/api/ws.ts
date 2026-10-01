import {
  avatarStateSchema,
  type AvatarState,
} from '../../entities/building/model/building-schema.ts';
import type { ApiError } from '../result/api-result.ts';

export interface PresenceHandlers {
  onAvatar: (avatar: AvatarState) => void;
  onError?: (error: ApiError) => void;
}

export interface PresenceHandle {
  socket: WebSocket;
  close: () => void;
}

/** WebSocket URL for avatar presence. Falls back to same-origin `/ws/avatars`. */
export function presenceWsUrl(): string {
  const configured = import.meta.env['VITE_WS_URL'];
  if (configured) {
    return configured;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws/avatars`;
}

/** Validate one inbound frame. Hub error frames surface as typed http errors. */
function parseInboundFrame(data: unknown): AvatarState | ApiError {
  const record =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
  if (record?.['type'] === 'error') {
    const message = record['message'];
    return {
      kind: 'http',
      message: typeof message === 'string' ? message : 'presence error',
    };
  }
  const parsed = avatarStateSchema.safeParse(data);
  if (!parsed.success) {
    return { kind: 'parse', message: 'Invalid presence frame' };
  }
  return parsed.data;
}

/**
 * Open the presence socket. Caller throttles sends to 15-20 Hz.
 * Malformed frames and socket failures report through `onError`, never throw.
 */
export function openPresenceSocket({ onAvatar, onError }: PresenceHandlers): PresenceHandle {
  const socket = new WebSocket(presenceWsUrl());
  socket.addEventListener('message', (event) => {
    let data: unknown;
    try {
      data = JSON.parse(String(event.data));
    } catch {
      onError?.({ kind: 'parse', message: 'Invalid presence frame' });
      return;
    }
    const frame = parseInboundFrame(data);
    if ('kind' in frame) {
      onError?.(frame);
      return;
    }
    onAvatar(frame);
  });
  socket.addEventListener('error', () => {
    onError?.({ kind: 'network', message: 'Presence socket error' });
  });
  return {
    socket,
    close: () => {
      socket.close();
    },
  };
}
