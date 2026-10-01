import { create } from 'zustand';
import { err, ok, type Result } from 'neverthrow';
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
  update: (input: unknown) => Result<void, LayoutError>;
}
export const useLayoutStore = create<LayoutState>((set) => ({
  source: demoLayout,
  layout: initial.value,
  error: null,
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
}));
