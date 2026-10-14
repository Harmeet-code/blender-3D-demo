import { create } from 'zustand';
import { configuredEventId } from '@/app/config/constants.ts';
import type { NormalizedLayout } from '@/features/building/model/normalize-layout.ts';

export interface WayfindingPreferences {
  stepFree: boolean;
  recent: string[];
  saved: string[];
  lastFloorId: string | null;
  lastMode: 'orbit' | 'walk';
}
const empty = (): WayfindingPreferences => ({
  stepFree: false,
  recent: [],
  saved: [],
  lastFloorId: null,
  lastMode: 'orbit',
});
const prefix = 'wayfinding:v2:';
export function wayfindingScope(layout: NormalizedLayout) {
  return `${encodeURIComponent(configuredEventId())}:${encodeURIComponent(layout.buildingId)}`;
}
function read(scope: string): WayfindingPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(prefix + scope) ?? 'null');
    const ids = (items: unknown) =>
      Array.isArray(items)
        ? items.filter((id): id is string => typeof id === 'string' && id.length < 512).slice(0, 30)
        : [];
    return value && typeof value === 'object'
      ? {
          stepFree: value.stepFree === true,
          recent: ids(value.recent),
          saved: ids(value.saved),
          lastFloorId:
            typeof value.lastFloorId === 'string' && value.lastFloorId.length < 512
              ? value.lastFloorId
              : null,
          lastMode: value.lastMode === 'walk' ? 'walk' : 'orbit',
        }
      : empty();
  } catch {
    return empty();
  }
}
interface PreferencesState {
  records: Record<string, WayfindingPreferences>;
  hydrate: (scope: string) => void;
  update: (
    scope: string,
    change: (previous: WayfindingPreferences) => WayfindingPreferences,
  ) => void;
}
export const useWayfindingPreferences = create<PreferencesState>((set, get) => ({
  records: {},
  hydrate: (scope) => {
    if (!get().records[scope]) {
      set({ records: { ...get().records, [scope]: read(scope) } });
    }
  },
  update: (scope, change) => {
    const next = change(get().records[scope] ?? read(scope));
    set({ records: { ...get().records, [scope]: next } });
    try {
      localStorage.setItem(prefix + scope, JSON.stringify(next));
    } catch {
      /* Private browsing or quota: retain session preferences. */
    }
  },
}));
export function rememberDestination(layout: NormalizedLayout, id: string) {
  if (id.startsWith('point:') || id.startsWith('avatar:')) {
    return;
  }
  useWayfindingPreferences.getState().update(wayfindingScope(layout), (previous) => ({
    ...previous,
    recent: [id, ...previous.recent.filter((item) => item !== id)].slice(0, 12),
  }));
}
export function stepFreePreference(layout: NormalizedLayout) {
  if (typeof window === 'undefined') {
    return false;
  }
  const scope = wayfindingScope(layout);
  useWayfindingPreferences.getState().hydrate(scope);
  return useWayfindingPreferences.getState().records[scope]?.stepFree ?? false;
}
/** Persisted floor/mode restore. Shared `?floor=` links always win. */
export function rememberFloor(layout: NormalizedLayout, floorId: string) {
  useWayfindingPreferences.getState().update(wayfindingScope(layout), (previous) => ({
    ...previous,
    lastFloorId: floorId,
  }));
}
export function rememberMode(layout: NormalizedLayout, mode: 'orbit' | 'walk') {
  useWayfindingPreferences.getState().update(wayfindingScope(layout), (previous) => ({
    ...previous,
    lastMode: mode,
  }));
}
export function preferredFloorId(layout: NormalizedLayout): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (new URLSearchParams(window.location.search).get('floor')) {
    return null;
  }
  const scope = wayfindingScope(layout);
  useWayfindingPreferences.getState().hydrate(scope);
  const id = useWayfindingPreferences.getState().records[scope]?.lastFloorId;
  return id && layout.floors.some((floor) => floor.id === id) ? id : null;
}
export function preferredWalkMode(layout: NormalizedLayout): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const scope = wayfindingScope(layout);
  useWayfindingPreferences.getState().hydrate(scope);
  return useWayfindingPreferences.getState().records[scope]?.lastMode === 'walk';
}
if (typeof window !== 'undefined') {
  const synchronize = (event: StorageEvent) => {
    if (!event.key?.startsWith(prefix)) {
      return;
    }
    const scope = event.key.slice(prefix.length);
    useWayfindingPreferences.setState((state) => ({
      records: { ...state.records, [scope]: read(scope) },
    }));
  };
  window.addEventListener('storage', synchronize);
  import.meta.hot?.dispose(() => window.removeEventListener('storage', synchronize));
}
