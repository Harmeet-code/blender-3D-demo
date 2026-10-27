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
  setOption: (option: RouteOption) => void;
  setOutcome: (outcome: RouteOutcome | null) => void;
  setStatus: (status: WayfindingStatus) => void;
  clear: () => void;
}

export const useWayfindingStore = create<WayfindingState>()((set) => ({
  zones: [],
  request: null,
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
  setRequest: (request) => set({ request }),
  setOption: (option) => set({ option }),
  setOutcome: (outcome) =>
    set({
      outcome,
      status: outcome ? (outcome.failure ? 'failed' : 'ready') : 'idle',
      failure: outcome?.failure ?? null,
      buildMs: outcome?.buildMs ?? null,
    }),
  setStatus: (status) => set({ status }),
  clear: () => set({ request: null, outcome: null, status: 'idle', failure: null, buildMs: null }),
}));

export const selectActiveResult = (state: WayfindingState): RouteResult | null =>
  state.outcome?.options[state.option] ?? null;
