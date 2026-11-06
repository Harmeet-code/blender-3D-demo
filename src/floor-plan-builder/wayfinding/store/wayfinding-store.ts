import { create } from 'zustand';
import type { WalkableZone } from '../model/zone-schema.ts';
import type { RouteRequest, RouteResult } from '../model/route-schema.ts';
import type { RouteOutcome } from '../navigation/route-service.ts';

export type WayfindingStatus =
  | 'idle'
  | 'picking-start'
  | 'picking-dest'
  | 'routing'
  | 'ready'
  | 'failed';

export type RouteOption = 'shortest' | 'accessible';

interface WayfindingState {
  zones: WalkableZone[];
  request: RouteRequest | null;
  submittedRequest: RouteRequest | null;
  option: RouteOption;
  animated: boolean;
  setAnimated: (animated: boolean) => void;
  outcome: RouteOutcome | null;
  status: WayfindingStatus;
  failure: string | null;
  buildMs: number | null;
  setZones: (zones: WalkableZone[]) => void;
  addZone: (zone: WalkableZone) => void;
  removeZone: (id: string) => void;
  setRequest: (request: RouteRequest | null) => void;
  fetchRoute: () => void;
  invalidateRoute: () => void;
  setOption: (option: RouteOption) => void;
  setOutcome: (outcome: RouteOutcome | null) => void;
  setStatus: (status: WayfindingStatus) => void;
  clear: () => void;
}

export const useWayfindingStore = create<WayfindingState>()((set, get) => ({
  zones: [],
  request: null,
  submittedRequest: null,
  option: 'shortest',
  animated: true,
  setAnimated: (animated) => set({ animated }),
  outcome: null,
  status: 'idle',
  failure: null,
  buildMs: null,
  setZones: (zones) => set({ zones }),
  addZone: (zone) => set((state) => ({ zones: [...state.zones, zone] })),
  removeZone: (id) => set((state) => ({ zones: state.zones.filter((zone) => zone.id !== id) })),
  setRequest: (request) => {
    console.log('[route-debug] request edited: clearing preview', { hasRequest: !!request, hadSubmittedRequest: !!get().submittedRequest, hadOutcome: !!get().outcome });
    set({ request, submittedRequest: null, outcome: null, status: 'idle', failure: null, buildMs: null });
  },
  fetchRoute: () => {
    const { request, option, status } = get();
    console.log('[route-debug] fetch requested', { request: request ? { start: request.start, dest: request.dest, accessibleOnly: request.accessibleOnly, allowRestricted: request.allowRestricted } : null, option, previousStatus: status });
    if (request) {
      set({ submittedRequest: structuredClone(request), outcome: null, status: 'routing', failure: null, buildMs: null });
    }
  },
  invalidateRoute: () => {
    console.log('[route-debug] route invalidated', { hadSubmittedRequest: !!get().submittedRequest, hadOutcome: !!get().outcome });
    set({ submittedRequest: null, outcome: null, status: 'idle', failure: null, buildMs: null });
  },
  setOption: (option) => set((state) => state.option === option ? state : ({
    option,
    request: state.request ? { ...state.request, accessibleOnly: option === 'accessible' } : null,
    submittedRequest: null, outcome: null, status: 'idle', failure: null, buildMs: null,
  })),
  setOutcome: (outcome) => {
    console.log('[route-debug] outcome committed', { option: get().option, options: outcome ? Object.keys(outcome.options) : [], failure: outcome?.failure, failures: outcome?.failures, buildMs: outcome?.buildMs, activeSegmentCount: outcome?.options[get().option]?.segments.length ?? 0 });
    set({
      outcome,
      status: outcome ? (outcome.failure ? 'failed' : 'ready') : 'idle',
      failure: outcome?.failure ?? null,
      buildMs: outcome?.buildMs ?? null,
    });
  },
  setStatus: (status) => set({ status }),
  clear: () => {
    if (get().request || get().submittedRequest || get().outcome) {
      console.log('[route-debug] route cleared', { hadRequest: !!get().request, hadSubmittedRequest: !!get().submittedRequest, hadOutcome: !!get().outcome });
    }
    set({ request: null, submittedRequest: null, outcome: null, status: 'idle', failure: null, buildMs: null });
  },
}));

export const selectActiveResult = (state: WayfindingState): RouteResult | null =>
  state.outcome?.options[state.option] ?? null;
