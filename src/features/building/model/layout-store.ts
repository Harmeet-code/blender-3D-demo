import { create } from 'zustand';
import { err, ok, type Result } from 'neverthrow';
import {
  buildingLayoutSchema,
  demoLayout,
  type BuildingLayout,
} from '@/features/building/model/building-schema.ts';
import {
  normalizeLayout,
  type LayoutError,
  type NormalizedLayout,
} from '@/features/building/model/normalize-layout.ts';

import { LayoutHistory, draftKey } from './layout-history.ts';
const history = new LayoutHistory();
let autosave: ReturnType<typeof setTimeout> | undefined;
function saveDraft(source: BuildingLayout) {
  clearTimeout(autosave);
  autosave = setTimeout(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(draftKey(source.buildingId), JSON.stringify(source));
      }
    } catch {
      useLayoutStore.setState({
        error:
          'Local draft storage is full or unavailable. Export JSON or save the venue to retain your work.',
      });
    }
  }, 700);
}
const initial = normalizeLayout(demoLayout);
if (initial.isErr()) {
  throw new Error(initial.error.message);
}
interface LayoutState {
  source: BuildingLayout;
  layout: NormalizedLayout;
  error: string | null;
  dirty: boolean;
  markSaved: (source: BuildingLayout) => void;
  undoCount: number;
  redoCount: number;
  commit: (input: unknown) => Result<void, LayoutError>;
  undo: () => void;
  redo: () => void;
  recoverDraft: () => Result<void, LayoutError>;
  update: (input: unknown) => Result<void, LayoutError>;
}
export const useLayoutStore = create<LayoutState>((set, get) => ({
  source: demoLayout,
  layout: initial.value,
  error: null,
  dirty: false,
  markSaved: (source) => {
    if (JSON.stringify(source) === JSON.stringify(get().source)) {
      set({ dirty: false });
    }
  },
  undoCount: 0,
  redoCount: 0,
  commit: (input) => {
    const previous = get().source;
    const wasDirty = get().dirty;
    const result = get().update(input);
    if (result.isErr()) {
      return result;
    }
    if (JSON.stringify(previous) === JSON.stringify(get().source)) {
      set({ dirty: wasDirty });
      return result;
    }
    history.push(previous);
    set({ ...history.counts(), dirty: true });
    saveDraft(get().source);
    return result;
  },
  undo: () => {
    const target = history.undo(get().source);
    if (target) {
      get().update(target);
      saveDraft(get().source);
      set({ dirty: true });
    }
    set(history.counts());
  },
  redo: () => {
    const target = history.redo(get().source);
    if (target) {
      get().update(target);
      saveDraft(get().source);
      set({ dirty: true });
    }
    set(history.counts());
  },
  recoverDraft: () => {
    try {
      const text = localStorage.getItem(draftKey(get().source.buildingId));
      return text
        ? get().commit(JSON.parse(text))
        : err({ code: 'INVALID_LAYOUT', message: 'No local draft is available for this venue.' });
    } catch {
      return err({ code: 'INVALID_LAYOUT', message: 'The local draft is unreadable.' });
    }
  },
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
    if (source.data.buildingId !== get().source.buildingId) {
      history.clear();
      set(history.counts());
    }
    set({ source: source.data, layout: result.value, error: null, dirty: false });
    return ok();
  },
}));
