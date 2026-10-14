import { create } from 'zustand';
import type { NormalizedLayout } from '@/features/building/model/normalize-layout.ts';
import { isFloorPointClear } from '@/features/building/model/floor-point-clear.ts';
import { floorPointDestination, type NavigationDestination } from './navigation-destinations.ts';

export type RoutePointSlot = 'from' | 'to';
interface PointSelectionState {
  layout: NormalizedLayout | null;
  pickSlot: RoutePointSlot | null;
  from: NavigationDestination | null;
  to: NavigationDestination | null;
  error: string | null;
  begin: (layout: NormalizedLayout, slot: RoutePointSlot) => void;
  select: (layout: NormalizedLayout, floorId: string, point: [number, number]) => boolean;
  cancel: () => void;
  clear: () => void;
  syncLayout: (layout: NormalizedLayout) => void;
}
const empty = { pickSlot: null, from: null, to: null, error: null };

/** A click is a semantic commit; pointer motion does not update React or rebake navigation. */
export const useRoutePointSelection = create<PointSelectionState>((set, get) => ({
  ...empty,
  layout: null,
  begin: (layout, pickSlot) => {
    if (get().layout !== layout) {
      set({ ...empty, layout, pickSlot });
    } else {
      set({ pickSlot, error: null });
    }
  },
  select: (layout, floorId, point) => {
    const state = get();
    if (state.layout !== layout || !state.pickSlot) {
      return false;
    }
    const destination = floorPointDestination(layout, floorId, point);
    if (!destination || !isFloorPointClear(layout, floorId, point)) {
      set({
        error:
          'Choose a clear floor point with enough space for your avatar, inside a walkable area.',
      });
      return false;
    }
    set({ [state.pickSlot]: destination, pickSlot: null, error: null });
    return true;
  },
  cancel: () => set({ pickSlot: null, error: null }),
  clear: () => set({ ...empty, layout: null }),
  syncLayout: (layout) => {
    if (get().layout !== layout) {
      set({ ...empty, layout });
    }
  },
}));
if (import.meta.hot) {
  import.meta.hot.dispose(() => useRoutePointSelection.getState().clear());
}
