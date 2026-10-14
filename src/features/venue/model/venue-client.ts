import { apiBaseUrl } from '../../../api/base-url.ts';
import type {
  VenueCommand,
  VenueEvent,
  VenueSession,
  VenueSnapshot,
  VenuePublicView,
} from './venue-contracts.ts';

// Session credentials stay in memory. A reload requires signing in again.
let session: VenueSession | null = null;
export function venueSession(): VenueSession | null {
  return session;
}
async function request<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}/api/venue${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: {
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof body.message === 'string' ? body.message : `Venue request failed (${response.status})`,
    );
  }
  return body as T;
}
export async function venueBootstrap(name: string, password: string): Promise<VenueSession> {
  const value = await request<VenueSession>('/auth/bootstrap', { name, password });
  session = value;
  return value;
}
export async function venueLogin(name: string, password: string): Promise<VenueSession> {
  const value = await request<VenueSession>('/auth/login', { name, password });
  session = value;
  return value;
}
export async function venueLogout(): Promise<void> {
  try {
    await request('/auth/logout', {});
  } finally {
    session = null;
  }
}
export function venueEvents(): Promise<VenueEvent[]> {
  return request('/events');
}
export function venueSnapshot(eventId: string): Promise<VenueSnapshot> {
  return request(`/events/${encodeURIComponent(eventId)}`);
}
export function venueCommand(eventId: string, command: VenueCommand): Promise<VenueSnapshot> {
  return request(`/events/${encodeURIComponent(eventId)}/commands`, command);
}
export function venueAuthStatus(): Promise<{ configured: boolean; bootstrapAllowed: boolean }> {
  return request('/auth/status');
}
export function venueSignage(
  eventId: string,
): Promise<{ version: number; signage: VenueSnapshot['signage'] }> {
  return request(`/events/${encodeURIComponent(eventId)}/signage`);
}
export async function venueCreateEvent(
  name: string,
  templateEventId?: string,
): Promise<VenueSnapshot> {
  return venueCommand('new', { type: 'create-event', name, templateEventId });
}
export function venueAuthorizationHeaders(): Record<string, string> {
  return session ? { Authorization: `Bearer ${session.token}` } : {};
}
export function venuePublicView(eventId: string): Promise<VenuePublicView> {
  return request(`/events/${encodeURIComponent(eventId)}/public`);
}
export function venueTelemetry(
  eventId: string,
  items: { kind: 'search' | 'route' | 'dwell'; durationSeconds?: number }[],
): Promise<{ recorded: boolean }> {
  return request(`/events/${encodeURIComponent(eventId)}/telemetry`, { items });
}
/**
 * Fire-and-forget analytics for visitor search/route actions. Never rejects,
 * never blocks navigation: telemetry is aggregate-only and safe to drop when
 * offline, unevented, or unauthenticated.
 */
export function reportTelemetry(
  eventId: string | undefined,
  items: { kind: 'search' | 'route' | 'dwell'; durationSeconds?: number }[],
): void {
  if (!eventId || items.length === 0 || typeof fetch !== 'function') {
    return;
  }
  try {
    const pending = venueTelemetry(eventId, items);
    pending.catch(() => {});
  } catch {
    /* Telemetry must not break wayfinding. */
  }
}
