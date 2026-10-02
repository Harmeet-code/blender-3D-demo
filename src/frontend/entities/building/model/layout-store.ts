import { create } from 'zustand';
import { err, ok, type Result } from 'neverthrow';
import { getLayout } from '../api/layouts-client.ts';
import { buildingLayoutSchema, demoLayout, type BuildingLayout } from './building-schema.ts';
import { normalizeLayout, type LayoutError, type NormalizedLayout } from './normalize-layout.ts';

let latestLoadRequestId = 0;
const inFlightLoads = new Map<string, { requestId: number; promise: Promise<void> }>();

const initial = normalizeLayout(demoLayout);
if (initial.isErr()) {
  throw new Error(initial.error.message);
}
interface LayoutState {
  source: BuildingLayout;
  layout: NormalizedLayout;
  error: string | null;
  loadStatus: 'idle' | 'loading' | 'ready' | 'error';
  loadError: string | null;
  update: (input: unknown) => Result<void, LayoutError>;
  load: (eventId: string) => Promise<void>;
}
export const useLayoutStore = create<LayoutState>((set) => ({
  source: demoLayout,
  layout: initial.value,
  error: null,
  loadStatus: 'idle',
  loadError: null,
  update: (input) => {
    const result = normalizeLayout(input);
    if (result.isErr()) {
      set({ error: result.error.message });
      return err(result.error);
    }
    const source = buildingLayoutSchema.safeParse(input);
    if (!source.success) {
      return err({ code: 'INVALID_LAYOUT', message: source.error.message });
    }
    set({ source: source.data, layout: result.value, error: null });
    return ok();
  },
  load: (eventId) => {
    const existingLoad = inFlightLoads.get(eventId);
    if (existingLoad) {
      return existingLoad.promise;
    }

    const requestId = ++latestLoadRequestId;
    set({ loadStatus: 'loading', loadError: null });
    const request = (async () => {
      try {
        const result = await getLayout(eventId);
        if (requestId !== latestLoadRequestId) {
          return;
        }
        if (result.isErr()) {
          set({ loadStatus: 'error', loadError: result.error.message });
          return;
        }
        const updated = useLayoutStore.getState().update(result.value);
        if (updated.isErr()) {
          set({ loadStatus: 'error', loadError: updated.error.message });
          return;
        }
        set({ loadStatus: 'ready', loadError: null });
      } catch (error) {
        if (requestId === latestLoadRequestId) {
          set({
            loadStatus: 'error',
            loadError: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })().finally(() => {
      if (inFlightLoads.get(eventId)?.requestId === requestId) {
        inFlightLoads.delete(eventId);
      }
    });
    inFlightLoads.set(eventId, { requestId, promise: request });
    return request;
  },
}));
