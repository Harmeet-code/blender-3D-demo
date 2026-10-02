import { create } from 'zustand';
import { err, ok, type Result } from 'neverthrow';
import { getLayout } from '../api/layouts-client.ts';
import { buildingLayoutSchema, demoLayout, type BuildingLayout } from './building-schema.ts';
import { normalizeLayout, type LayoutError, type NormalizedLayout } from './normalize-layout.ts';
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
  load: async (eventId) => {
    set({ loadStatus: 'loading', loadError: null });
    try {
      const result = await getLayout(eventId);
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
      set({
        loadStatus: 'error',
        loadError: error instanceof Error ? error.message : String(error),
      });
    }
  },
}));
