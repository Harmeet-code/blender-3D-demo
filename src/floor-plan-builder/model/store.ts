import { create } from 'zustand';
import { blankDocument, blankFloor, encodeLayout } from './adapter.ts';
import { createObject, inventory, nextBoothNumber, rectangle, uniqueName } from './inventory.ts';
import { placementError, objectFromDrawing, resizeObject, insideBoundary, rotatePosition, transformZonePolygon } from './geometry.ts';
import { polygonBounds } from '@/utils/geometry/polygon.ts';
import { prepareFloorEdit } from './floor-edit.ts';
import { boothPresets, withPreset } from './presets.ts';
import { inverseStep, reconcileConnectors, restoreStep, type FloorStep } from './history.ts';
import { transformGroup } from './grouping.ts';
import { snapBoothPosition } from './booth.ts';
import { snapBarrierPosition } from './barrier.ts';
import { fitCirculation, snapCirculation } from './circulation.ts';
import { snapWashRackPosition } from './wash-rack-spatial.ts';
import {
  objectSchema,
  polygonSchema,
  isConnector,
  isBooth,
  type PlanDocument,
  type PlanFloor,
  type PlanObject,
  type PlanZone,
  type RecipeId,
  type Selection,
  type Tool,
} from './types.ts';

interface History {
  undo: FloorStep[];
  redo: FloorStep[];
}
interface DraftSnapshot {
  pendingObject: PlanObject | null;
  pendingObjects: PlanObject[] | null;
  pendingZone: PlanZone | null;
  pendingZones: PlanZone[] | null;
  pendingFloor: PlanFloor | null;
  pendingRemoval: Selection | null;
  drawing: [number, number][];
  selection: Selection | null;
  selectionSet: Selection[];
  tool: Tool;
}
interface DraftHistory {
  base: DraftSnapshot;
}

function snapAuthoredObjectPosition(
  object: PlanObject,
  siblings: PlanObject[],
  floor: PlanFloor,
  position: readonly [number, number],
): [number, number] {
  const boothSnapped = snapBoothPosition(object, siblings, [position[0], position[1]]);
  const barrierSnapped = snapBarrierPosition(object, siblings, boothSnapped);
  const rackSnapped = snapWashRackPosition(object, siblings, barrierSnapped);
  return snapCirculation({ ...object, position: rackSnapped }, floor).position;
}
export interface PublicationIssue {
  floorId?: string;
  objectId?: string;
  message: string;
}
const draftSnapshot = (state: DraftSnapshot): DraftSnapshot => ({
  pendingObject: state.pendingObject,
  pendingObjects: state.pendingObjects,
  pendingZone: state.pendingZone,
  pendingZones: state.pendingZones,
  pendingFloor: state.pendingFloor,
  pendingRemoval: state.pendingRemoval,
  drawing: state.drawing,
  selection: state.selection,
  selectionSet: state.selectionSet,
  tool: state.tool,
});
export interface StudioState {
  document: PlanDocument;
  savedDocument: PlanDocument;
  floorId: string;
  selection: Selection | null;
  selectionSet: Selection[];
  selectionHistory: Record<string, { entries: Selection[]; cursor: number }>;
  navigateSelection: (delta: number) => void;
  groupObjects: (ids: string[]) => void;
  ungroup: () => void;
  tool: Tool;
  recipe: RecipeId;
  presetId: string | null;
  poiRecipe: 'stairs' | 'entrance';
  placementYaw: number;
  setPlacementYaw: (yaw: number) => void;
  choosePreset: (id?: string) => void;
  cyclePoi: () => void;
  drawing: [number, number][];
  pointer: [number, number] | null;
  pendingObject: PlanObject | null;
  pendingObjects: PlanObject[] | null;
  pendingZone: PlanZone | null;
  pendingZones: PlanZone[] | null;
  pendingFloor: PlanFloor | null;
  pendingRemoval: Selection | null;
  draftHistory: Record<string, DraftHistory>;
  stage: (updates: Partial<DraftSnapshot>) => void;
  removePoint: () => void;
  revision: number;
  documentEpoch: number;
  savedRevision: number;
  history: Record<string, History>;
  saveState: 'Unsynced' | 'Saving' | 'Saved' | 'Error';
  message: string;
  publicationIssues: { revision: number; entries: PublicationIssue[] } | null;
  imageSizes: Record<string, { url: string; size: [number, number] }>;
  focusId: string | null;
  focusTick: number;
  focus: () => void;
  commitFloor: (floor: PlanFloor) => boolean;
  commitFloors: (floors: PlanFloor[]) => boolean;
  load: (document: PlanDocument, dirty?: boolean) => void;
  discardUnsaved: () => boolean;
  select: (selection: Selection | null) => boolean;
  setSelectionSet: (selections: Selection[]) => boolean;
  toggleSelection: (selection: Selection) => boolean;
  setFloor: (id: string) => boolean;
  setTool: (tool: Tool, recipe?: RecipeId) => void;
  beginPlacement: (recipe: RecipeId) => boolean;
  beginDuplicate: () => boolean;
  cancel: () => void;
  addPoint: (point: [number, number]) => void;
  setPointer: (point: [number, number] | null) => void;
  place: (point: [number, number]) => boolean;
  apply: () => boolean;
  patchObject: (updates: Partial<PlanObject>) => void;
  rotateSelection: (yawDelta: number, preview?: boolean) => boolean;
  patchZone: (updates: Partial<PlanZone>) => void;
  patchFloor: (updates: Partial<PlanFloor>) => void;
  toggleLock: (selection: Selection) => void;
  remove: (selection?: Selection) => void;
  undo: () => void;
  redo: () => void;
  addFloor: () => void;
  deleteFloor: (id: string) => void;
  reorderFloor: (delta: number) => void;
  updateFloor: (updates: Partial<PlanFloor>) => boolean;
  linkConnector: (targetFloor: string, position?: [number, number]) => boolean;
  unlinkConnector: (targetFloor: string) => boolean;
  markSaved: (revision: number, savedDocument?: PlanDocument) => void;
  notify: (message: string) => void;
}
export function activeFloor(state: Pick<StudioState, 'document' | 'floorId'>): PlanFloor {
  return (
    state.document.floors.find((floor) => floor.source.id === state.floorId) ??
    state.document.floors[0]!
  );
}
function selectedEntity(floor: PlanFloor, selection: Selection) {
  return selection.kind === 'object'
    ? floor.objects.find((object) => object.id === selection.id)
    : floor.zones.find((zone) => zone.id === selection.id);
}
function isLockedSelection(floor: PlanFloor, selection: Selection): boolean {
  return selectedEntity(floor, selection)?.locked === true;
}
function selectionLabel(floor: PlanFloor, selection: Selection): string {
  return selection.kind === 'object'
    ? floor.objects.find((object) => object.id === selection.id)?.name ?? 'Selected item'
    : floor.zones.find((zone) => zone.id === selection.id)?.label ?? 'Selected item';
}
/** Shared center of the selected object anchors and zone bounds, excluding locked entities. */
export function selectionPivot(floor: PlanFloor, selections: Selection[]): [number, number] {
  const centers = selections.flatMap((selection): [number, number][] => {
    if (selection.kind === 'object') {
      const object = floor.objects.find((item) => item.id === selection.id);
      return object && !object.locked ? [[object.position[0], object.position[1]]] : [];
    }
    const zone = floor.zones.find((item) => item.id === selection.id);
    if (!zone || zone.locked) return [];
    const bounds = polygonBounds(zone.polygon);
    return [[(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2]];
  });
  if (!centers.length) {
    return [0, 0];
  }
  const xs = centers.map(([x]) => x),
    zs = centers.map(([, z]) => z);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
}
function floorNames(floor: PlanFloor, exceptId?: string): string[] {
  return [
    floor.source.name,
    ...floor.objects.filter((object) => object.id !== exceptId).map((object) => object.name),
    ...floor.zones.filter((zone) => zone.id !== exceptId).map((zone) => zone.label),
  ];
}
/**
 * Move and rotate every selected entity — objects and zones alike — around one shared pivot.
 * Locked entities are skipped so a protected placement cannot be changed by a bulk edit.
 */
function transformSelection(
  floor: PlanFloor,
  selectionSet: Selection[],
  delta: { dx: number; dz: number; yaw: number },
): { objects: PlanObject[]; zones: PlanZone[] } {
  const pivot = selectionPivot(floor, selectionSet);
  const objects: PlanObject[] = [];
  const zones: PlanZone[] = [];
  for (const selection of selectionSet) {
    if (selection.kind === 'object') {
      const object = floor.objects.find((item) => item.id === selection.id);
      if (!object || object.locked) {
        continue;
      }
      const rotated = rotatePosition(object.position, pivot, delta.yaw);
      objects.push({
        ...object,
        position: [rotated[0] + delta.dx, rotated[1] + delta.dz],
        yawRadians: object.yawRadians + delta.yaw,
        managed: true,
      });
    } else {
      const zone = floor.zones.find((item) => item.id === selection.id);
      if (!zone || zone.locked) {
        continue;
      }
      zones.push({
        ...zone,
        polygon: transformZonePolygon(zone.polygon, delta.dx, delta.dz, delta.yaw, pivot),
      });
    }
  }
  return { objects, zones };
}

export function unfinished(
  state: Pick<
    StudioState,
    'drawing' | 'pendingObject' | 'pendingObjects' | 'pendingZone' | 'pendingZones' | 'pendingFloor' | 'pendingRemoval' | 'floorId'
  >,
): boolean {
  return (
    state.drawing.length > 0 ||
    !!state.pendingObject ||
    !!state.pendingObjects ||
    !!state.pendingZone ||
    !!state.pendingZones ||
    !!state.pendingFloor ||
    !!state.pendingRemoval
  );
}
function commitPendingForm(state: StudioState): boolean {
  const hasPendingForm =
    !!state.pendingObject ||
    !!state.pendingObjects?.length ||
    !!state.pendingZone ||
    !!state.pendingZones?.length ||
    !!state.pendingFloor;
  if (!hasPendingForm) { return !unfinished(state); }
  if (state.drawing.length || state.pendingRemoval) { return false; }
  return state.apply();
}
function restoreSavedStep(state: StudioState, direction: 'undo' | 'redo'): Partial<StudioState> {
  const history = state.history[state.floorId],
    step = history?.[direction].at(-1);
  if (!step || !history) {
    return {};
  }
  try {
    const document = restoreStep(state.document, step);
    encodeLayout(document);
    const inverse = inverseStep(state.document, document, state.floorId);
    return {
      document,
      history: {
        ...state.history,
        [state.floorId]:
          direction === 'undo'
            ? { undo: history.undo.slice(0, -1), redo: [...history.redo, inverse] }
            : { undo: [...history.undo, inverse], redo: history.redo.slice(0, -1) },
      },
      // Selection and viewport context are not part of document history. Keep a live selection
      // across undo/redo; clear it only if the selected record no longer exists in the restored doc.
      selection:
        state.selection &&
        (state.selection.kind === 'object'
          ? activeFloor({ ...state, document }).objects.some(
              (item) => item.id === state.selection!.id,
            )
          : activeFloor({ ...state, document }).zones.some(
              (item) => item.id === state.selection!.id,
            ))
          ? state.selection
          : null,
      selectionSet: state.selection &&
        (state.selection.kind === 'object'
          ? activeFloor({ ...state, document }).objects.some((item) => item.id === state.selection!.id)
          : activeFloor({ ...state, document }).zones.some((item) => item.id === state.selection!.id))
        ? [state.selection]
        : [],
      revision: state.revision + 1,
      saveState: 'Unsynced',
      message: direction === 'undo' ? 'Undid active-floor edit.' : 'Redid active-floor edit.',
    };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Unable to restore this saved step.',
    };
  }
}
export function createStudioStore(eventId: string, initial = blankDocument(eventId)) {
  return create<StudioState>((set, get) => ({
    document: initial,
    savedDocument: initial,
    floorId: initial.floors[0]!.source.id,
    selection: null,
    selectionSet: [],
    selectionHistory: {},
    navigateSelection: (delta) => {
      let state = get();
      if (unfinished(state) && !commitPendingForm(state)) { return; }
      state = get();
      const trail = state.selectionHistory[state.floorId];
      if (!trail || !Number.isInteger(delta) || delta === 0) {
        return;
      }
      const floor = activeFloor(state);
      for (
        let cursor = trail.cursor + delta;
        cursor >= 0 && cursor < trail.entries.length;
        cursor += delta
      ) {
        const selection = trail.entries[cursor]!;
        if (
          selection.kind === 'object'
            ? floor.objects.some((object) => object.id === selection.id)
            : floor.zones.some((zone) => zone.id === selection.id)
        ) {
          set({
            selection,
            selectionSet: [selection],
            focusId: selection.id,
            selectionHistory: { ...state.selectionHistory, [state.floorId]: { ...trail, cursor } },
          });
          return;
        }
      }
    },
    groupObjects: (ids) => {
      const state = get(),
        floor = activeFloor(state);
      if (unfinished(state)) {
        state.notify('Apply or discard the unfinished edit before grouping.');
        return;
      }
      const members = new Set(ids.filter((id) => floor.objects.some((object) => object.id === id)));
      if (members.size < 2) {
        state.notify('Choose at least two objects to group.');
        return;
      }
      const groupId = crypto.randomUUID();
      if (
        state.commitFloor({
          ...floor,
          objects: floor.objects.map((object) =>
            members.has(object.id) ? Object.assign({}, object, { groupId, managed: true }) : object,
          ),
        })
      ) {
        state.notify(
          'Objects grouped. Moving or rotating a member moves the group; shape edits stay individual.',
        );
      }
    },
    ungroup: () => {
      const state = get(),
        floor = activeFloor(state),
        groupId = floor.objects.find((object) => object.id === state.selection?.id)?.groupId;
      if (unfinished(state) || !groupId) {
        return;
      }
      if (
        state.commitFloor({
          ...floor,
          objects: floor.objects.map((object) =>
            object.groupId === groupId
              ? Object.assign({}, object, { groupId: '', managed: true })
              : object,
          ),
        })
      ) {
        state.notify('Group removed. Objects retained.');
      }
    },
    tool: 'select',
    recipe: 'booth',
    presetId: null,
    poiRecipe: 'entrance',
    placementYaw: 0,
    setPlacementYaw: (yaw) => {
      if (unfinished(get())) {
        get().notify('Apply or discard the unfinished edit before changing placement rotation.');
        return;
      }
      if (Number.isFinite(yaw)) {
        set({ placementYaw: yaw });
      }
    },
    choosePreset: (id) => {
      if (unfinished(get())) {
        get().notify('Apply or discard the unfinished edit before selecting a preset.');
        return;
      }
      const index = boothPresets.findIndex((preset) => preset.id === get().presetId);
      const preset =
        boothPresets.find((item) => item.id === id) ??
        boothPresets[(index + 1) % boothPresets.length]!;
      set({
        presetId: preset.id,
        recipe: 'booth',
        tool: 'place',
        pointer: null,
        message: `${preset.label} preset selected. Click to place.`,
      });
    },
    cyclePoi: () => {
      if (unfinished(get())) {
        get().notify('Apply or discard the unfinished edit before changing POI mode.');
        return;
      }
      const recipe = get().poiRecipe === 'stairs' ? 'entrance' : 'stairs';
      set({
        poiRecipe: recipe,
        recipe,
        presetId: null,
        tool: 'place',
        pointer: null,
        message: `Place ${recipe} selected.`,
      });
    },
    drawing: [],
    pointer: null,
    pendingObject: null,
    pendingObjects: null,
    pendingZone: null,
    pendingZones: null,
    pendingFloor: null,
    pendingRemoval: null,
    draftHistory: {},
    stage: (updates) =>
      set((state) => ({
        ...updates,
        draftHistory: {
          ...state.draftHistory,
          [state.floorId]: state.draftHistory[state.floorId] ?? { base: draftSnapshot(state) },
        },
      })),
    removePoint: () => {
      const state = get();
      if (state.drawing.length) {
        state.stage({ drawing: state.drawing.slice(0, -1) });
      }
    },
    revision: 0,
    documentEpoch: 0,
    savedRevision: 0,
    history: {},
    saveState: 'Saved',
    message: 'Choose a tool or drag an item onto the floor.',
    publicationIssues: null,
    imageSizes: {},
    focusId: null,
    focusTick: 0,
    focus: () =>
      set((state) => ({ focusId: state.selection?.id ?? null, focusTick: state.focusTick + 1 })),
    notify: (message) => set({ message }),
    commitFloor: (floor) =>
      get().commitFloors(
        get().document.floors.map((item) => (item.source.id === floor.source.id ? floor : item)),
      ),
    commitFloors: (floors) => {
      const state = get(),
        previous = activeFloor(state);
      const draftHistory = { ...state.draftHistory };
      delete draftHistory[previous.source.id];
      const history = state.history[previous.source.id] ?? { undo: [], redo: [] };
      const document = reconcileConnectors({ ...state.document, floors });
      try {
        encodeLayout(document);
      } catch (error) {
        set({ message: error instanceof Error ? error.message : 'Invalid document.' });
        return false;
      }
      set({
        document,
        history: {
          ...state.history,
          [previous.source.id]: {
            undo: [
              ...history.undo.slice(-49),
              inverseStep(state.document, document, previous.source.id),
            ],
            redo: [],
          },
        },
        revision: state.revision + 1,
        saveState: 'Unsynced',
        pendingObject: null,
        pendingObjects: null,
        pendingZone: null,
        pendingZones: null,
        pendingFloor: null,
        pendingRemoval: null,
        draftHistory,
        drawing: [],
      });
      return true;
    },
    load: (document, dirty = false) =>
      set((state) => ({
        document,
        savedDocument: dirty ? state.savedDocument : document,
        documentEpoch: state.documentEpoch + 1,
        publicationIssues: null,
        imageSizes: {},
        floorId: document.floors.some((floor) => floor.source.id === state.floorId)
          ? state.floorId
          : document.floors[0]!.source.id,
        selection: null,
        selectionSet: [],
        selectionHistory: {},
        pendingObject: null,
        pendingObjects: null,
        pendingZone: null,
        pendingZones: null,
        pendingFloor: null,
        pendingRemoval: null,
        draftHistory: {},
        drawing: [],
        history: {},
        revision: state.revision + 1,
        savedRevision: dirty ? -1 : state.revision + 1,
        saveState: dirty ? 'Unsynced' : 'Saved',
        message: dirty
          ? 'Draft restored. Review and finalize when ready.'
          : 'Published layout loaded.',
      })),
    discardUnsaved: () => {
      const state = get();
      if (state.saveState === 'Saving') {
        state.notify('Wait for the current save to finish before discarding changes.');
        return false;
      }
      const revision = state.revision + 1;
      set({
        document: state.savedDocument,
        revision,
        savedRevision: revision,
        documentEpoch: state.documentEpoch + 1,
        saveState: 'Saved',
        selection: null,
        selectionSet: [],
        pendingObject: null,
        pendingObjects: null,
        pendingZone: null,
        pendingZones: null,
        pendingFloor: null,
        pendingRemoval: null,
        drawing: [],
        pointer: null,
        draftHistory: {},
        history: {},
        publicationIssues: null,
        message: 'Unsaved changes discarded.',
      });
      return true;
    },
    select: (selection) => {
      const current = get();
      if (unfinished(current) && !commitPendingForm(current)) {
        set({ message: get().message || 'Finish or correct this edit before selecting another item.' });
        return false;
      }
      set((state) => {
        const prior = state.selectionHistory[state.floorId];
        const entries = selection
          ? [
              ...(prior?.entries.slice(0, prior.cursor + 1) ?? []).filter(
                (entry) => entry.kind !== selection.kind || entry.id !== selection.id,
              ),
              selection,
            ].slice(-50)
          : (prior?.entries ?? []);
        return {
          selection,
          selectionSet: selection ? [selection] : [],
          focusId: selection?.id ?? null,
          selectionHistory: {
            ...state.selectionHistory,
            [state.floorId]: { entries, cursor: entries.length - 1 },
          },
        };
      });
      return true;
    },
    setSelectionSet: (selections) => {
      let state = get();
      if (unfinished(state) && !commitPendingForm(state)) { return false; }
      state = get();
      const floor = activeFloor(state);
      const locked = selections.filter((selection) => isLockedSelection(floor, selection));
      const unique = selections.filter((selection, index) => {
        const exists = selection.kind === 'object'
          ? floor.objects.some((object) => object.id === selection.id && object.managed && !object.locked)
          : floor.zones.some((zone) => zone.id === selection.id && !zone.locked);
        return exists && selections.findIndex((item) => item.kind === selection.kind && item.id === selection.id) === index;
      });
      if (locked.length) {
        state.notify(`${locked.map((item) => selectionLabel(floor, item)).join(', ')} stayed locked and was not added to the selection.`);
      }
      // Mixed selections need an object anchor for the rotation ring and numeric
      // transform controls; keep zone-only selections usable as before.
      const selection = unique.findLast((item) => item.kind === 'object') ?? unique.at(-1) ?? null;
      set({ selection, selectionSet: unique, focusId: selection?.id ?? null });
      return true;
    },
    toggleSelection: (selection) => {
      let state = get();
      if (unfinished(state) && !commitPendingForm(state)) { return false; }
      state = get();
      const current = state.selectionSet.length ? state.selectionSet : state.selection ? [state.selection] : [];
      const selected = current.some((item) => item.kind === selection.kind && item.id === selection.id);
      const floor = activeFloor(state);
      if (!selected && isLockedSelection(floor, selection)) {
        state.notify(`${selectionLabel(floor, selection)} is locked. Select it directly to unlock it.`);
        return false;
      }
      const next = selected
        ? current.filter((item) => item.kind !== selection.kind || item.id !== selection.id)
        : [...current, selection];
      return get().setSelectionSet(next);
    },
    setFloor: (id) => {
      let state = get();
      if (id === state.floorId) {
        return true;
      }
      if (unfinished(state) && !commitPendingForm(state)) {
        set({ message: get().message || 'Finish or correct this edit before changing floors.' });
        return false;
      }
      state = get();
      if (!state.document.floors.some((floor) => floor.source.id === id)) {
        return false;
      }
      set({ floorId: id, selection: null, selectionSet: [], tool: 'select', pointer: null, focusId: null });
      return true;
    },
    setTool: (tool, recipe) => {
      let state = get();
      if (unfinished(state) && !commitPendingForm(state)) {
        set({ message: get().message || 'Finish or correct this edit before changing tools.' });
        return;
      }
      state = get();
      const lockedSelection = state.selection && isLockedSelection(activeFloor(state), state.selection)
        ? state.selection
        : null;
      if (lockedSelection && ['move', 'resize'].includes(tool)) {
        state.notify(`${selectionLabel(activeFloor(state), lockedSelection)} is locked. Unlock it before editing.`);
        return;
      }
      set({
        tool,
        ...(recipe ? { recipe, presetId: null } : {}),
        pointer: null,
        message:
          tool === 'remove'
            ? 'Remove armed. Click an object or zone; Escape cancels.'
            : tool === 'polygon' || tool === 'zone-polygon'
              ? 'Click vertices. Enter, double-click or right-click finishes; Escape cancels.'
              : `${tool.replaceAll('-', ' ')} mode selected.`,
      });
    },
    beginPlacement: (recipe) => {
      let state = get();
      if (unfinished(state) && !commitPendingForm(state)) {
        get().notify(get().message || 'Finish or correct this edit before placing another item.');
        return false;
      }
      state = get();
      if (!inventory.some((item) => item.id === recipe)) {
        state.notify('That item is unavailable.');
        return false;
      }
      set({
        tool: 'place',
        recipe,
        presetId: null,
        pointer: null,
        selection: null,
        selectionSet: [],
        focusId: null,
        message: `Place ${inventory.find((item) => item.id === recipe)!.name}.`,
      });
      return true;
    },
    beginDuplicate: () => {
      let state = get();
      if (unfinished(state) && !commitPendingForm(state)) {
        get().notify(get().message || 'Finish or correct this edit before duplicating.');
        return false;
      }
      state = get();
      const floor = activeFloor(state);
      const requested = state.selectionSet.length
        ? state.selectionSet
        : state.selection
          ? [state.selection]
          : [];
      const locked = requested.filter((selection) => isLockedSelection(floor, selection));
      const eligible = requested.filter((selection) => {
        if (selection.kind === 'object') {
          const object = floor.objects.find((item) => item.id === selection.id);
          return !!object && !object.locked;
        }
        const zone = floor.zones.find((item) => item.id === selection.id);
        return !!zone && !zone.locked;
      });
      if (!eligible.length) {
        state.notify(
          locked.length
            ? `${locked.map((item) => selectionLabel(floor, item)).join(', ')} is locked. Unlock it before duplicating.`
            : 'Select an editable object or zone to duplicate.',
        );
        return false;
      }
      const primary = eligible.findLast((item) => item.kind === 'object') ?? eligible.at(-1)!;
      set({
        tool: 'duplicate',
        pointer: null,
        selection: primary,
        selectionSet: eligible,
        message: locked.length
          ? `${locked.map((item) => selectionLabel(floor, item)).join(', ')} stayed locked. Move the copies, then click to place them.`
          : 'Move the copy, then click to place it.',
      });
      return true;
    },
    cancel: () =>
      set((state) => ({
        selection: state.draftHistory[state.floorId]
          ? state.draftHistory[state.floorId]!.base.selection
          : state.selection,
        selectionSet: state.draftHistory[state.floorId]
          ? state.draftHistory[state.floorId]!.base.selectionSet
          : state.selectionSet,
        tool: 'select',
        drawing: [],
        pointer: null,
        pendingObject: null,
        pendingObjects: null,
        pendingZone: null,
        pendingZones: null,
        pendingFloor: null,
        pendingRemoval: null,
        draftHistory: {},
        message: 'Unfinished edit discarded.',
      })),
    addPoint: (point) => {
      const state = get();
      if (state.pendingObject || state.pendingZone || state.pendingFloor || state.pendingRemoval) {
        state.notify('Apply or discard the unfinished form before drawing.');
        return;
      }
      const last = state.drawing.at(-1);
      if (last && Math.hypot(last[0] - point[0], last[1] - point[1]) < 1e-6) {
        return;
      }
      if (!point.every(Number.isFinite) || state.drawing.length >= 256) {
        state.notify('Use finite coordinates and at most 256 drawing vertices.');
        return;
      }
      state.stage({ drawing: [...state.drawing, point] });
    },
    setPointer: (pointer) => {
      const state = get(),
        floor = activeFloor(state);
      const selected = floor.objects.find((item) => item.id === state.selection?.id);
      const object =
        state.tool === 'place'
          ? {
              ...withPreset(createObject(state.recipe, [0, 0], floor.objects), state.presetId),
              yawRadians: state.placementYaw,
            }
          : selected;
      set({
        pointer:
          pointer && object && ['place', 'move', 'duplicate'].includes(state.tool)
            ? snapAuthoredObjectPosition(object, floor.objects, floor, pointer)
            : pointer,
      });
    },
    patchObject: (updates) => {
      const state = get(),
        floor = activeFloor(state),
        original = floor.objects.find((object) => object.id === state.selection?.id);
      if (original) {
        if (original.locked) {
          state.notify(`${original.name} is locked. Unlock it before editing.`);
          return;
        }
        if (state.pendingFloor || state.pendingRemoval || state.pendingZone) {
          state.notify('Apply or discard the unfinished edit first.');
          return;
        }
        const pendingObject = { ...(state.pendingObject ?? original), ...updates, managed: true };
        if (updates.position && state.tool === 'move') {
          pendingObject.position = snapAuthoredObjectPosition(
            pendingObject,
            activeFloor(state).objects,
            activeFloor(state),
            pendingObject.position,
          );
        }
        const selectionSet = state.selectionSet.length
          ? state.selectionSet
          : state.selection
            ? [state.selection]
            : [];
        const locked = selectionSet.filter((selection) => isLockedSelection(floor, selection));
        // Every selected entity — objects and zones alike — follows the primary item.
        const entities = selectionSet.filter((selection) =>
          selection.kind === 'object'
            ? floor.objects.some((object) => object.id === selection.id && !object.locked)
            : floor.zones.some((zone) => zone.id === selection.id && !zone.locked),
        );
        const yaw =
          typeof updates.yawRadians === 'number' ? updates.yawRadians - original.yawRadians : 0;
        const dx = updates.position ? pendingObject.position[0] - original.position[0] : 0;
        const dz = updates.position ? pendingObject.position[1] - original.position[1] : 0;
        if (entities.length > 1 && (updates.position || yaw)) {
          const { objects, zones } = transformSelection(floor, entities, {
            dx,
            dz,
            yaw,
          });
          state.stage({
            pendingObject,
            pendingObjects: objects.map((item) => (item.id === original.id ? pendingObject : item)),
            pendingZones: zones.length ? zones : null,
          });
          if (locked.length) {
            state.notify(`${locked.map((item) => selectionLabel(floor, item)).join(', ')} stayed locked; other selected items changed.`);
          }
          return;
        }
        state.stage({ pendingObject, pendingObjects: null, pendingZones: null });
        if (locked.length && (updates.position || yaw)) {
          state.notify(`${locked.map((item) => selectionLabel(floor, item)).join(', ')} stayed locked.`);
        }
      }
    },
    rotateSelection: (yawDelta, preview = false) => {
      const state = get(),
        floor = activeFloor(state),
        requested = state.selectionSet.length
          ? state.selectionSet
          : state.selection
            ? [state.selection]
            : [];
      if (!Number.isFinite(yawDelta) || Math.abs(yawDelta) < 1e-8) {
        return false;
      }
      if (!preview && unfinished(state)) {
        state.notify('Apply or discard the unfinished edit before rotating.');
        return false;
      }
      if (state.pendingFloor || state.pendingRemoval || state.pendingZone) {
        state.notify('Apply or discard the unfinished edit before rotating.');
        return false;
      }
      const locked = requested.filter((selection) => isLockedSelection(floor, selection));
      const eligible = requested.filter((selection) => {
        if (selection.kind === 'object') {
          const object = floor.objects.find((item) => item.id === selection.id);
          return !!object && !object.locked;
        }
        const zone = floor.zones.find((item) => item.id === selection.id);
        return !!zone && !zone.locked;
      });
      if (!eligible.length) {
        state.notify(
          locked.length
            ? `${locked.map((item) => selectionLabel(floor, item)).join(', ')} is locked. Unlock it before rotating.`
            : 'Select an editable object or zone before rotating.',
        );
        return false;
      }
      let objects: PlanObject[];
      let zones: PlanZone[];
      let skippedLocked = locked;
      const onlyObject = eligible.length === 1 && eligible[0]?.kind === 'object'
        ? floor.objects.find((item) => item.id === eligible[0]!.id)
        : undefined;
      if (onlyObject?.groupId) {
        const group = transformGroup(floor, onlyObject, {
          ...onlyObject,
          yawRadians: onlyObject.yawRadians + yawDelta,
          managed: true,
        });
        const lockedGroupMembers = group.filter((item) => item.locked);
        skippedLocked = [
          ...locked,
          ...lockedGroupMembers.map((item) => ({ kind: 'object' as const, id: item.id })),
        ];
        objects = group.filter((item) => !item.locked);
        zones = [];
      } else {
        const transformed = transformSelection(floor, eligible, {
          dx: 0,
          dz: 0,
          yaw: yawDelta,
        });
        objects = transformed.objects;
        zones = transformed.zones;
      }
      const selectedObject = state.selection?.kind === 'object'
        ? objects.find((item) => item.id === state.selection?.id)
        : undefined;
      state.stage({
        pendingObject: selectedObject ?? null,
        pendingObjects: objects.length ? objects : null,
        pendingZones: zones.length ? zones : null,
      });
      if (skippedLocked.length) {
        state.notify(`${skippedLocked.map((item) => selectionLabel(floor, item)).join(', ')} stayed locked; other selected items changed.`);
      } else {
        state.notify('Rotation preview.');
      }
      return true;
    },
    patchZone: (updates) => {
      const state = get(),
        original = activeFloor(state).zones.find((zone) => zone.id === state.selection?.id);
      if (original) {
        if (original.locked) {
          state.notify(`${original.label} is locked. Unlock it before editing.`);
          return;
        }
        if (
          state.pendingFloor ||
          state.pendingRemoval ||
          state.pendingObject ||
          state.pendingObjects ||
          state.pendingZones
        ) {
          state.notify('Apply or discard the unfinished edit first.');
          return;
        }
        state.stage({ pendingZone: { ...(state.pendingZone ?? original), ...updates } });
      }
    },
    /**
     * Locked objects stay out of marquee selection and every bulk edit, but they remain
     * individually selectable so the lock can always be released.
     */
    toggleLock: (selection) => {
      const state = get();
      if (unfinished(state)) {
        state.notify('Apply or discard the unfinished edit before locking an item.');
        return;
      }
      const floor = activeFloor(state);
      const object = selection.kind === 'object'
        ? floor.objects.find((item) => item.id === selection.id)
        : undefined;
      const zone = selection.kind === 'zone'
        ? floor.zones.find((item) => item.id === selection.id)
        : undefined;
      const target = object ?? zone;
      if (!target) {
        return;
      }
      if (object && !object.managed) {
        state.notify(`${selectionLabel(floor, selection)} is an imported reference and cannot be locked in this editor.`);
        return;
      }
      const locked = selection.kind === 'object' ? !object!.locked : !zone!.locked;
      const nextFloor = selection.kind === 'object'
        ? {
            ...floor,
            objects: floor.objects.map((object) =>
              object.id === target.id ? { ...object, locked } : object,
            ),
          }
        : {
            ...floor,
            zones: floor.zones.map((zone) =>
              zone.id === target.id ? { ...zone, locked } : zone,
            ),
          };
      if (!get().commitFloor(nextFloor)) {
        return;
      }
      const remaining = state.selectionSet.filter(
        (item) => item.kind !== selection.kind || item.id !== selection.id,
      );
      const selectionSet = locked && remaining.length ? remaining : [selection];
      const nextSelection =
        selectionSet.findLast((item) => item.kind === 'object' && !isLockedSelection(nextFloor, item)) ??
        selectionSet.at(-1) ??
        null;
      set({
        selection: nextSelection,
        selectionSet,
        focusId: nextSelection?.id ?? null,
        message: locked
          ? `${selectionLabel(floor, selection)} locked. It is excluded from marquee selection and bulk edits.`
          : `${selectionLabel(floor, selection)} unlocked.`,
      });
    },
    patchFloor: (updates) => {
      const state = get();
      if (
        state.pendingObject ||
        state.pendingObjects ||
        state.pendingZone ||
        state.pendingRemoval ||
        state.drawing.length
      ) {
        state.notify('Apply or discard the object/zone edit before changing floor properties.');
        return;
      }
      state.stage({ pendingFloor: { ...(state.pendingFloor ?? activeFloor(state)), ...updates } });
    },
    place: (point) => {
      const state = get(),
        floor = activeFloor(state);
      if (unfinished(state)) {
        state.notify('Apply or discard the unfinished edit before placing another item.');
        return false;
      }
      if (state.tool === 'spawn') {
        if (!get().commitFloor({ ...floor, spawn: point })) {
          return false;
        }
        set({ tool: 'select' });
        return true;
      }
      const selectionSet = state.selectionSet.length
        ? state.selectionSet
        : state.selection
          ? [state.selection]
          : [];
      if (['move', 'duplicate'].includes(state.tool)) {
        const skippedLocked = selectionSet
          .filter((selection) => isLockedSelection(floor, selection))
          .map((selection) => selectionLabel(floor, selection));
        const eligibleSelections = selectionSet.filter((selection) => {
          if (selection.kind === 'object') {
            const object = floor.objects.find((item) => item.id === selection.id);
            return !!object && object.managed && !object.locked;
          }
          const zone = floor.zones.find((item) => item.id === selection.id);
          return !!zone && !zone.locked;
        });
        // A move or duplicate transforms every selected entity — objects and zones alike.
        const selectedObjects = eligibleSelections
          .filter((selection) => selection.kind === 'object')
          .map((selection) => floor.objects.find((object) => object.id === selection.id))
          .filter((object): object is PlanObject => !!object && object.managed && !object.locked);
        const selectedZones = eligibleSelections
          .filter((selection) => selection.kind === 'zone')
          .map((selection) => floor.zones.find((zone) => zone.id === selection.id))
          .filter((zone): zone is PlanZone => !!zone && !zone.locked);
        if (!selectedObjects.length && !selectedZones.length) {
          state.notify(
            skippedLocked.length
              ? `${skippedLocked.join(', ')} is locked. Unlock it before moving or duplicating.`
              : 'Select an editable object or zone before moving or duplicating.',
          );
          return false;
        }
        const primary = eligibleSelections.some(
          (item) => item.kind === state.selection?.kind && item.id === state.selection?.id,
        )
          ? state.selection
          : (eligibleSelections.findLast((item) => item.kind === 'object') ?? eligibleSelections.at(-1) ?? null);
        const primaryObject = selectedObjects.find((object) => object.id === primary?.id);
        const primaryZone = selectedZones.find((zone) => zone.id === primary?.id);
        const anchor = selectionPivot(floor, eligibleSelections);
        const delta: [number, number] = [point[0] - anchor[0], point[1] - anchor[1]];
        const movedZones: PlanZone[] = selectedZones.map((zone) => ({
          ...zone,
          polygon: transformZonePolygon(zone.polygon, delta[0], delta[1], 0, anchor),
        }));
        // A single explicitly grouped object retains its group behavior. Temporary mixed
        // selections operate on their selected entities without absorbing persistent groups.
        const groupMembers = state.tool === 'move' && eligibleSelections.length === 1 && primaryObject?.groupId
          ? transformGroup(floor, primaryObject, { ...primaryObject, position: point, managed: true })
              .filter((object) => !object.locked)
          : [];
        const movedObjects: PlanObject[] = [
          ...groupMembers,
          ...selectedObjects
            .filter((member) => !groupMembers.some((item) => item.id === member.id))
            .map((member) => ({
              ...member,
              position: [
                member.position[0] + delta[0],
                member.position[1] + delta[1],
              ] as [number, number],
              managed: true,
            })),
        ];
        if (state.tool === 'duplicate') {
          const names = floorNames(floor),
            reservedNumbers: string[] = [];
          const copies: PlanObject[] = movedObjects.map((member) => {
            const name = uniqueName(`${member.name} Copy`, names);
            const boothNumber = isBooth(member)
              ? nextBoothNumber(floor.objects, reservedNumbers)
              : '';
            names.push(name);
            if (boothNumber) reservedNumbers.push(boothNumber);
            return {
              ...structuredClone(member),
              id: crypto.randomUUID(),
              name,
              boothNumber,
              // Temporary multi-selection copies remain independent; grouping stays explicit.
              groupId: '',
              portalId: '',
              connectsFloorIds: [],
              legacyPoiId: undefined,
              managed: true,
            };
          });
          const zoneCopies: PlanZone[] = movedZones.map((zone) => {
            const label = uniqueName(`${zone.label} Copy`, names);
            names.push(label);
            return { ...structuredClone(zone), id: crypto.randomUUID(), label };
          });
          if (zoneCopies.some((zone) => !insideBoundary(zone.polygon, floor.boundary))) {
            set({ message: 'Keep the zone inside the floor.' });
            return false;
          }
          const candidateFloor = {
            ...floor,
            objects: [...floor.objects, ...copies],
            zones: [...floor.zones, ...zoneCopies],
          };
          const error = copies
            .map((member) => placementError(member, candidateFloor))
            .find(Boolean);
          if (error) {
            set({ message: error });
            return false;
          }
          if (!get().commitFloor(candidateFloor)) {
            return false;
          }
          set({
            selection: copies.length
              ? { kind: 'object', id: copies[0]!.id }
              : { kind: 'zone', id: zoneCopies[0]!.id },
            selectionSet: [
              ...copies.map((member) => ({ kind: 'object' as const, id: member.id })),
              ...zoneCopies.map((zone) => ({ kind: 'zone' as const, id: zone.id })),
            ],
            tool: 'select',
            pointer: null,
            message: `${skippedLocked.length ? `${skippedLocked.join(', ')} stayed locked. ` : ''}${copies.length + zoneCopies.length} selected ${copies.length + zoneCopies.length === 1 ? 'item' : 'items'} duplicated.`,
          });
          return true;
        }
        if (movedZones.some((zone) => !insideBoundary(zone.polygon, floor.boundary))) {
          set({ message: 'Keep the zone inside the floor.' });
          return false;
        }
        const candidateFloor = {
          ...floor,
          objects: floor.objects.map((item) => {
            const moved = movedObjects.find((member) => member.id === item.id);
            return moved ?? item;
          }),
          zones: floor.zones.map((item) => {
            const moved = movedZones.find((zone) => zone.id === item.id);
            return moved ?? item;
          }),
        };
        const error = movedObjects
          .map((member) => placementError(member, candidateFloor))
          .find(Boolean);
        if (error) {
          set({ message: error });
          return false;
        }
        if (!get().commitFloor(candidateFloor)) {
          return false;
        }
        set({
          selection: primaryObject
            ? { kind: 'object', id: primaryObject.id }
            : primaryZone
              ? { kind: 'zone', id: primaryZone.id }
              : state.selection,
          selectionSet: eligibleSelections,
          tool: 'select',
          pointer: null,
          message: `${skippedLocked.length ? `${skippedLocked.join(', ')} stayed locked. ` : ''}Selection moved.`,
        });
        return true;
      }
      let object: PlanObject;
      let members: PlanObject[];
      {
        object = withPreset(
          createObject(state.recipe, point, floor.objects, floorNames(floor)),
          state.presetId,
        );
        object.yawRadians = state.placementYaw;
        members = [object];
      }
      const snapped = snapAuthoredObjectPosition(object, floor.objects, floor, object.position);
      const dx = snapped[0] - object.position[0],
        dz = snapped[1] - object.position[1];
      members = members.map((member) => ({
        ...member,
        position: [member.position[0] + dx, member.position[1] + dz] as [number, number],
      }));
      object = members.find((member) => member.id === object.id)!;
      const candidateFloor = {
        ...floor,
        objects: [
          ...floor.objects.filter((item) => !members.some((member) => member.id === item.id)),
          ...members,
        ],
      };
      const error = members.map((member) => placementError(member, candidateFloor)).find(Boolean);
      if (error) {
        set({ message: error });
        return false;
      }
      if (!get().commitFloor(candidateFloor)) {
        return false;
      }
      set({
        selection: { kind: 'object', id: object.id },
        selectionSet: [{ kind: 'object' as const, id: object.id }],
        message: `${object.name} placed.`,
        // A placement or manipulation is one-shot. A rejected candidate returns above without
        // changing the active tool, so the preview remains available for correction.
        tool: 'select',
        pointer: null,
      });
      return true;
    },
    apply: () => {
      const state = get(),
        floor = activeFloor(state);
      if (state.pendingRemoval) {
        const target = state.pendingRemoval;
        if (isLockedSelection(floor, target)) {
          state.notify(`${selectionLabel(floor, target)} is locked. Unlock it before deleting.`);
          return false;
        }
        if (
          !state.commitFloor({
            ...floor,
            objects:
              target.kind === 'object'
                ? floor.objects.filter((object) => object.id !== target.id)
                : floor.objects,
            zones:
              target.kind === 'zone'
                ? floor.zones.filter((zone) => zone.id !== target.id)
                : floor.zones,
          })
        ) {
          return false;
        }
        set({
          selection: null,
          selectionSet: [],
          tool: 'select',
          message: 'Removal applied. Undo saved step restores the item.',
        });
        return true;
      }
      if (state.pendingFloor) {
        if (!state.pendingFloor.source.name.trim()) {
          state.notify('Enter a floor name before applying.');
          return false;
        }
        let pending: PlanFloor;
        try {
          const hint = state.imageSizes[floor.source.id],
            url = floor.source.authoring?.originalImage ?? floor.source.image;
          pending = prepareFloorEdit(
            state.pendingFloor,
            floor,
            hint?.url === url ? hint.size : undefined,
          );
        } catch (error) {
          state.notify(error instanceof Error ? error.message : 'Invalid floor properties.');
          return false;
        }
        if (!polygonSchema.safeParse(pending.boundary).success) {
          state.notify('The floor needs a valid boundary with positive dimensions.');
          return false;
        }
        const name = uniqueName(
          pending.source.name,
          state.document.floors
            .filter((item) => item.source.id !== pending.source.id)
            .map((item) => item.source.name),
        );
        if (!get().commitFloor({ ...pending, source: { ...pending.source, name } })) {
          return false;
        }
        set({ message: 'Floor properties applied.' });
        return true;
      }
      if (state.pendingObjects?.length || state.pendingZones?.length) {
        const updates = (state.pendingObjects ?? []).map((object) => objectSchema.safeParse(object));
        const invalid = updates.find((result) => !result.success);
        if (invalid) {
          if (invalid.success) return false;
          set({ message: invalid.error.issues[0]?.message ?? 'Check selected object properties.' });
          return false;
        }
        const objects = updates.flatMap((result) => result.success ? [result.data] : []);
        const zones = state.pendingZones ?? [];
        for (const zone of zones) {
          if (!zone.label.trim()) {
            set({ message: 'Zone name is required.' });
            return false;
          }
          if (
            !polygonSchema.safeParse(zone.polygon).success ||
            !insideBoundary(zone.polygon, floor.boundary)
          ) {
            set({ message: 'Zone requires a valid polygon inside the floor.' });
            return false;
          }
        }
        const candidateFloor = {
          ...floor,
          objects: floor.objects.map((item) => objects.find((candidate) => candidate.id === item.id) ?? item),
          zones: floor.zones.map((item) => zones.find((candidate) => candidate.id === item.id) ?? item),
        };
        const error = objects.map((object) => placementError(object, candidateFloor)).find(Boolean);
        if (error) {
          set({ message: error });
          return false;
        }
        if (!get().commitFloor(candidateFloor)) return false;
        set({ message: 'Selected items updated.' });
        return true;
      }
      if (state.pendingObject) {
        const parsed = objectSchema.safeParse(state.pendingObject);
        if (!parsed.success) {
          set({ message: parsed.error.issues[0]?.message ?? 'Check object properties.' });
          return false;
        }
        const bounds = polygonBounds(parsed.data.polygon);
        const object = {
          ...parsed.data,
          name: uniqueName(parsed.data.name, [
            floor.source.name,
            ...floor.objects.filter((item) => item.id !== parsed.data.id).map((item) => item.name),
            ...floor.zones.map((zone) => zone.label),
          ]),
          dimensions: [
            bounds.maxX - bounds.minX,
            parsed.data.dimensions[1],
            bounds.maxZ - bounds.minZ,
          ] as [number, number, number],
        };
        const duplicate =
          object.boothNumber &&
          floor.objects.some(
            (other) =>
              other.id !== object.id &&
              other.boothNumber.trim().toLowerCase() === object.boothNumber.trim().toLowerCase(),
          );
        if (duplicate) {
          set({ message: 'Booth number already exists on this floor. Choose a unique number.' });
          return false;
        }
        const original = floor.objects.find((item) => item.id === object.id)!;
        const members = transformGroup(floor, original, object);
        const candidateFloor = {
          ...floor,
          objects: floor.objects.map(
            (item) => members.find((member) => member.id === item.id) ?? item,
          ),
        };
        const error = members.map((member) => placementError(member, candidateFloor)).find(Boolean);
        if (error) {
          set({ message: error });
          return false;
        }
        if (!get().commitFloor(candidateFloor)) {
          return false;
        }
        set({ message: 'Object changes applied.' });
        return true;
      }
      if (state.pendingZone) {
        if (!state.pendingZone.label.trim()) {
          state.notify('Enter a zone name before applying.');
          return false;
        }
        const result = polygonSchema.safeParse(state.pendingZone.polygon);
        if (!result.success || !insideBoundary(state.pendingZone.polygon, floor.boundary)) {
          set({ message: 'Zone requires a valid polygon inside the floor.' });
          return false;
        }
        if (
          !get().commitFloor({
            ...floor,
            zones: floor.zones.map((item) =>
              item.id === state.pendingZone!.id
                ? {
                    ...state.pendingZone!,
                    label: uniqueName(state.pendingZone!.label, [
                      floor.source.name,
                      ...floor.objects.map((object) => object.name),
                      ...floor.zones
                        .filter((zone) => zone.id !== state.pendingZone!.id)
                        .map((zone) => zone.label),
                    ]),
                  }
                : item,
            ),
          })
        ) {
          return false;
        }
        set({ message: 'Zone changes applied.' });
        return true;
      }
      if (state.drawing.length) {
        let points = state.drawing;
        const rect = ['rectangle', 'zone-rectangle', 'blocked-rectangle'].includes(state.tool);
        if (rect) {
          if (points.length < 2) {
            set({ message: 'Choose the opposite rectangle corner.' });
            return false;
          }
          const [a, b] = points;
          points = [
            [a![0], a![1]],
            [b![0], a![1]],
            [b![0], b![1]],
            [a![0], b![1]],
          ];
        }
        if (!polygonSchema.safeParse(points).success || !insideBoundary(points, floor.boundary)) {
          set({
            message: 'Drawing must have unique vertices, no crossings, and stay inside the floor.',
          });
          return false;
        }
        if (state.tool.includes('zone') || state.tool === 'blocked-rectangle') {
          const zone: PlanZone = {
            id: crypto.randomUUID(),
            label: uniqueName(
              state.tool === 'blocked-rectangle' ? 'Blocked zone' : 'Walkable zone',
              [
                floor.source.name,
                ...floor.objects.map((object) => object.name),
                ...floor.zones.map((z) => z.label),
              ],
            ),
            type: state.tool === 'blocked-rectangle' ? 'blocked' : 'walkable',
            locked: false,
            polygon: points,
          };
          if (!get().commitFloor({ ...floor, zones: [...floor.zones, zone] })) {
            return false;
          }
          set({ selection: { kind: 'zone', id: zone.id }, selectionSet: [{ kind: 'zone', id: zone.id }] });
        } else {
          const object = objectFromDrawing(
            points,
            withPreset(
              createObject(
                state.tool === 'polygon' ? 'polygon-booth' : 'booth',
                [0, 0],
                floor.objects,
                floorNames(floor),
              ),
              state.presetId,
            ),
          );
          const error = placementError(object, floor);
          if (error) {
            set({ message: error });
            return false;
          }
          if (!get().commitFloor({ ...floor, objects: [...floor.objects, object] })) {
            return false;
          }
          set({ selection: { kind: 'object', id: object.id }, selectionSet: [{ kind: 'object', id: object.id }] });
        }
        set({ tool: 'select', message: 'Drawing applied.' });
        return true;
      }
      if (unfinished(state)) {
        set({
          draftHistory: {},
          message: 'Draft history resolved; the applied document is unchanged.',
        });
        return true;
      }
      set({ message: 'No unfinished changes to apply.' });
      return false;
    },
    remove: (selection) => {
      const state = get();
      const selections = selection ? [selection] : state.selectionSet.length ? state.selectionSet : state.selection ? [state.selection] : [];
      if (!selections.length || unfinished(state)) {
        if (selections.length) {
          state.notify('Apply or discard the unfinished edit before removing an item.');
        }
        return;
      }
      const floor = activeFloor(state);
      const objectIds = new Set(selections.filter((item) => item.kind === 'object' && floor.objects.some((object) => object.id === item.id && object.managed)).map((item) => item.id));
      const zoneIds = new Set(selections.filter((item) => item.kind === 'zone').map((item) => item.id));
      if (!objectIds.size && !zoneIds.size) return;
      // Locked entities survive deletion, while other selected entities still proceed.
      const lockedObjects = floor.objects.filter(
        (object) => objectIds.has(object.id) && object.locked,
      );
      const lockedZones = floor.zones.filter((zone) => zoneIds.has(zone.id) && zone.locked);
      for (const object of lockedObjects) {
        objectIds.delete(object.id);
      }
      for (const zone of lockedZones) {
        zoneIds.delete(zone.id);
      }
      const lockedNames = [...lockedObjects.map((object) => object.name), ...lockedZones.map((zone) => zone.label)];
      if (!objectIds.size && !zoneIds.size) {
        set({
          message: `${lockedNames.join(', ')} is locked. Unlock it before deleting.`,
        });
        return;
      }
      const next = {
        ...floor,
        objects: floor.objects.filter((object) => !objectIds.has(object.id)),
        zones: floor.zones.filter((zone) => !zoneIds.has(zone.id)),
      };
      if (!get().commitFloor(next)) {
        return;
      }
      set({
        selection: null,
        selectionSet: [],
        tool: 'select',
        focusId: null,
        pointer: null,
        message: lockedNames.length
          ? `Selected items deleted. ${lockedNames.join(', ')} stayed locked.`
          : 'Selected items deleted.',
      });
    },
    undo: () => {
      const state = get();
      // Drafts, selection and tools are interaction state, not document history.
      if (unfinished(state)) {
        return;
      }
      set(restoreSavedStep(state, 'undo'));
    },
    redo: () => {
      const state = get(),
        history = state.history[state.floorId];
      if (unfinished(state) || !history) {
        return;
      }
      set(restoreSavedStep(state, 'redo'));
    },
    addFloor: () => {
      const state = get();
      if (unfinished(state)) {
        set({ message: 'Apply or discard before creating a floor.' });
        return;
      }
      const floor = blankFloor(
        uniqueName(
          'Floor',
          state.document.floors.map((f) => f.source.name),
        ),
        state.document.floors.length * 4,
      );
      set({
        document: { ...state.document, floors: [...state.document.floors, floor] },
        floorId: floor.source.id,
        selection: null,
        revision: state.revision + 1,
        saveState: 'Unsynced',
      });
    },
    deleteFloor: (id) => {
      const state = get();
      if (state.document.floors.length < 2 || unfinished(state)) {
        set({ message: 'Keep at least one floor and apply/discard unfinished edits first.' });
        return;
      }
      if (!state.document.floors.some((floor) => floor.source.id === id)) {
        return;
      }
      const document = reconcileConnectors({
        ...state.document,
        floors: state.document.floors.filter((floor) => floor.source.id !== id),
      });
      const { floors } = document;
      const history = Object.fromEntries(
        Object.entries(state.history)
          .filter(([floorId]) => floorId !== id)
          .map(([floorId, steps]) => [
            floorId,
            {
              undo: steps.undo.filter(
                (step) => !step.related.some((change) => change.floorId === id),
              ),
              redo: steps.redo.filter(
                (step) => !step.related.some((change) => change.floorId === id),
              ),
            },
          ]),
      );
      set({
        document,
        history,
        floorId: floors[0]!.source.id,
        selection: null,
        revision: state.revision + 1,
        saveState: 'Unsynced',
        message: 'Floor deleted.',
      });
    },
    reorderFloor: (delta) => {
      const state = get(),
        floors = [...state.document.floors],
        index = floors.findIndex((f) => f.source.id === state.floorId),
        other = index + delta;
      if (other < 0 || other >= floors.length || unfinished(state)) {
        return;
      }
      [floors[index], floors[other]] = [floors[other]!, floors[index]!];
      set({
        document: { ...state.document, floors },
        revision: state.revision + 1,
        saveState: 'Unsynced',
      });
    },
    updateFloor: (updates) => {
      const state = get();
      if (
        state.pendingObject ||
        state.pendingZone ||
        state.pendingRemoval ||
        state.drawing.length
      ) {
        state.notify('Apply or discard the object/zone edit before changing the floor.');
        return false;
      }
      return state.commitFloor({ ...(state.pendingFloor ?? activeFloor(state)), ...updates });
    },
    linkConnector: (targetFloor, position) => {
      let state = get();
      if (unfinished(state) && !commitPendingForm(state)) { return false; }
      state = get();
      const current = activeFloor(state),
        object = current.objects.find((o) => o.id === state.selection?.id),
        target = state.document.floors.find((floor) => floor.source.id === targetFloor);
      if (
        !object ||
        !isConnector(object.recipe) ||
        !target ||
        current.source.id === targetFloor ||
        unfinished(state)
      ) {
        return false;
      }
      position ??= object.targetLanding;
      if (!position.every(Number.isFinite)) {
        state.notify('Enter finite target landing coordinates.');
        return false;
      }
      const portalId = object.portalId || `fpb-portal:${crypto.randomUUID()}`;
      if (target.objects.some((o) => o.portalId === portalId)) {
        set({ message: 'This connector already has a landing on that floor.' });
        return false;
      }
      const fresh = createObject(object.recipe, position, target.objects, floorNames(target));
      let source = object;
      if (object.circulationDesign) {
        if (
          object.circulationDesign.role === 'upper' ||
          object.connectsFloorIds.length > 1 ||
          target.source.heightOffset <= current.source.heightOffset
        ) {
          state.notify(
            'Link this two-level connector from its lower floor to one higher floor. Disconnect existing landings before changing its floor span.',
          );
          return false;
        }
        source = fitCirculation({
          ...object,
          dimensions: [
            object.dimensions[0],
            target.source.heightOffset - current.source.heightOffset,
            object.dimensions[2],
          ],
        });
        const sourceError = placementError(source, current);
        if (sourceError) {
          state.notify(`Connector fitted to floor rise: ${sourceError}`);
          return false;
        }
      }
      let companion: PlanObject = {
        ...object,
        id: fresh.id,
        name: fresh.name,
        boothNumber: fresh.boothNumber,
        position,
        managed: true,
        groupId: '',
        legacyPoiId: undefined,
        portalId,
        connectsFloorIds: [current.source.id, targetFloor],
      };
      if (source.circulationDesign) {
        const width =
            source.circulationDesign.layout === 'switchback'
              ? source.circulationDesign.clearWidth
              : source.dimensions[0],
          depth = 1.5;
        companion = {
          ...companion,
          dimensions: [width, source.dimensions[1], depth],
          polygon: rectangle(width, depth),
          scale: [1, 1, 1],
          planarMatrix: undefined,
          circulationDesign: { ...source.circulationDesign, role: 'upper' },
        };
      }
      const error = placementError(companion, target);
      if (error) {
        set({ message: `Place the target landing first: ${error}` });
        return false;
      }
      const floors = state.document.floors.map((floor) =>
        floor.source.id === current.source.id
          ? {
              ...floor,
              objects: floor.objects.map((o) =>
                o.id === object.id
                  ? {
                      ...source,
                      portalId,
                      managed: true,
                      connectsFloorIds: [
                        ...new Set([...o.connectsFloorIds, current.source.id, targetFloor]),
                      ],
                    }
                  : o,
              ),
            }
          : floor.source.id === targetFloor
            ? { ...floor, objects: [...floor.objects, companion] }
            : floor,
      );
      if (!state.commitFloors(floors)) {
        return false;
      }
      set({
        message:
          'Connected floors. Undo this link on the source floor; position its landing on the target floor.',
      });
      return true;
    },
    unlinkConnector: (targetFloor) => {
      let state = get();
      if (unfinished(state) && !commitPendingForm(state)) { return false; }
      state = get();
      const floor = activeFloor(state),
        object = floor.objects.find((item) => item.id === state.selection?.id);
      if (!object?.portalId || targetFloor === state.floorId) {
        return false;
      }
      const floors = state.document.floors.map((item) =>
        item.source.id !== targetFloor
          ? item
          : {
              ...item,
              objects: item.objects.map((landing) =>
                landing.portalId === object.portalId
                  ? { ...landing, portalId: '', connectsFloorIds: [], managed: true }
                  : landing,
              ),
            },
      );
      if (!state.commitFloors(floors)) {
        return false;
      }
      state.notify(
        'Landing disconnected. Its object is retained; undo on this floor restores the link.',
      );
      return true;
    },
    markSaved: (revision, savedDocument) =>
      set((state) => ({
        savedRevision: Math.max(state.savedRevision, revision),
        savedDocument: savedDocument ?? (state.revision === revision ? state.document : state.savedDocument),
        saveState: state.revision === revision ? 'Saved' : 'Unsynced',
      })),
  }));
}
export type StudioStore = ReturnType<typeof createStudioStore>;
export { resizeObject, rectangle };
