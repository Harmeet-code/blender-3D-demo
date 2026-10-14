import { frontendEnv } from './env.ts';
import { useSyncExternalStore } from 'react';
const listeners = new Set<() => void>();
let selectedEvent: string | undefined;
let acceptedEvent = '';
if (typeof window !== 'undefined') {
  const fromLink = new URLSearchParams(window.location.search).get('event');
  try {
    selectedEvent = fromLink || sessionStorage.getItem('venue:event') || undefined;
  } catch {
    selectedEvent = fromLink || undefined;
  }
}
export function configuredEventId(): string {
  return selectedEvent ?? frontendEnv().VITE_EVENT_ID;
}
export function selectConfiguredEvent(id: string) {
  if (!id.trim() || id.length > 200 || id === configuredEventId()) {
    return;
  }
  selectedEvent = id;
  acceptedEvent = '';
  try {
    sessionStorage.setItem('venue:event', id);
  } catch {
    /* Storage may be disabled. */
  }
  for (const listener of listeners) {
    listener();
  }
}
export function useConfiguredEventId() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    configuredEventId,
    configuredEventId,
  );
}
/** Publication fetch or authenticated draft acceptance, never inferred from building IDs. */
export function acknowledgeEventLayout(id: string) {
  if (id !== configuredEventId()) {
    return;
  }
  acceptedEvent = id;
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.loadedEvent = id;
  }
  for (const listener of listeners) {
    listener();
  }
}
export function useAcceptedEventId() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => acceptedEvent,
    () => '',
  );
}
export function clearAcceptedEventLayout(id?: string) {
  if (id && acceptedEvent !== id) {
    return;
  }
  acceptedEvent = '';
  if (typeof document !== 'undefined') {
    delete document.documentElement.dataset.loadedEvent;
  }
  for (const listener of listeners) {
    listener();
  }
}
