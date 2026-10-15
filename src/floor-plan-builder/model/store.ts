import { create } from 'zustand';
import { blankDocument, blankFloor, encodeLayout } from './adapter.ts';
import { createObject, rectangle, uniqueName } from './inventory.ts';
import { placementError, objectFromDrawing, resizeObject, insideBoundary } from './geometry.ts';
import { polygonBounds } from '@/utils/geometry/polygon.ts';
import { prepareFloorEdit } from './floor-edit.ts';
import { boothPresets, withPreset } from './presets.ts';
import { inverseStep, reconcileConnectors, restoreStep, type FloorStep } from './history.ts';
import { transformGroup } from './grouping.ts';
import { snapBoothPosition } from './booth.ts';
import { fitCirculation, snapCirculation } from './circulation.ts';
import {
  objectSchema,
  polygonSchema,
  isConnector,
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
  pendingZone: PlanZone | null;
  pendingFloor: PlanFloor | null;
  pendingRemoval: Selection | null;
  drawing: [number, number][];
  selection: Selection | null;
  tool: Tool;
}
interface DraftHistory {
  base: DraftSnapshot;
  undo: DraftSnapshot[];
  redo: DraftSnapshot[];
}
export interface PublicationIssue {
  floorId?: string;
  objectId?: string;
  message: string;
}
const draftSnapshot = (state: DraftSnapshot): DraftSnapshot => ({
  pendingObject: state.pendingObject,
  pendingZone: state.pendingZone,
  pendingFloor: state.pendingFloor,
  pendingRemoval: state.pendingRemoval,
  drawing: state.drawing,
  selection: state.selection,
  tool: state.tool,
});
export interface StudioState {
  document: PlanDocument;
  floorId: string;
  selection: Selection | null;
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
  pendingZone: PlanZone | null;
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
  select: (selection: Selection | null) => boolean;
  setFloor: (id: string) => boolean;
  setTool: (tool: Tool, recipe?: RecipeId) => void;
  cancel: () => void;
  addPoint: (point: [number, number]) => void;
  setPointer: (point: [number, number] | null) => void;
  place: (point: [number, number]) => boolean;
  apply: () => boolean;
  patchObject: (updates: Partial<PlanObject>) => void;
  patchZone: (updates: Partial<PlanZone>) => void;
  patchFloor: (updates: Partial<PlanFloor>) => void;
  remove: (selection?: Selection) => void;
  undo: () => void;
  redo: () => void;
  addFloor: () => void;
  deleteFloor: (id: string) => void;
  reorderFloor: (delta: number) => void;
  updateFloor: (updates: Partial<PlanFloor>) => boolean;
  linkConnector: (targetFloor: string, position?: [number, number]) => boolean;
  unlinkConnector: (targetFloor: string) => boolean;
  markSaved: (revision: number) => void;
  notify: (message: string) => void;
}
export function activeFloor(state: Pick<StudioState, 'document' | 'floorId'>): PlanFloor {
  return (
    state.document.floors.find((floor) => floor.source.id === state.floorId) ??
    state.document.floors[0]!
  );
}
function floorNames(floor: PlanFloor, exceptId?: string): string[] {
  return [
    floor.source.name,
    ...floor.objects.filter((object) => object.id !== exceptId).map((object) => object.name),
    ...floor.zones.filter((zone) => zone.id !== exceptId).map((zone) => zone.label),
  ];
}
export function unfinished(
  state: Pick<
    StudioState,
    | 'drawing'
    | 'pendingObject'
    | 'pendingZone'
    | 'pendingFloor'
    | 'pendingRemoval'
    | 'draftHistory'
    | 'floorId'
  >,
): boolean {
  const history = state.draftHistory[state.floorId];
  return (
    state.drawing.length > 0 ||
    !!state.pendingObject ||
    !!state.pendingZone ||
    !!state.pendingFloor ||
    !!state.pendingRemoval ||
    !!(history && (history.undo.length || history.redo.length))
  );
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
      selection: null,
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
    floorId: initial.floors[0]!.source.id,
    selection: null,
    selectionHistory: {},
    navigateSelection: (delta) => {
      const state = get(),
        trail = state.selectionHistory[state.floorId];
      if (unfinished(state) || !trail || !Number.isInteger(delta) || delta === 0) {
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
            focusId: selection.id,
            focusTick: state.focusTick + 1,
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
    pendingZone: null,
    pendingFloor: null,
    pendingRemoval: null,
    draftHistory: {},
    stage: (updates) =>
      set((state) => {
        const before = draftSnapshot(state),
          history = state.draftHistory[state.floorId];
        return {
          ...updates,
          draftHistory: {
            ...state.draftHistory,
            [state.floorId]: {
              base: history && (history.undo.length || history.redo.length) ? history.base : before,
              undo: [...(history?.undo ?? []).slice(-63), before],
              redo: [],
            },
          },
        };
      }),
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
        pendingZone: null,
        pendingFloor: null,
        pendingRemoval: null,
        draftHistory: {
          ...state.draftHistory,
          [previous.source.id]: { base: draftSnapshot(state), undo: [], redo: [] },
        },
        drawing: [],
      });
      return true;
    },
    load: (document, dirty = false) =>
      set((state) => ({
        document,
        documentEpoch: state.documentEpoch + 1,
        publicationIssues: null,
        imageSizes: {},
        floorId: document.floors.some((floor) => floor.source.id === state.floorId)
          ? state.floorId
          : document.floors[0]!.source.id,
        selection: null,
        selectionHistory: {},
        pendingObject: null,
        pendingZone: null,
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
    select: (selection) => {
      if (unfinished(get())) {
        set({ message: 'Apply or discard the unfinished edit before selecting another item.' });
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
          focusId: selection?.id ?? null,
          focusTick: state.focusTick + 1,
          selectionHistory: {
            ...state.selectionHistory,
            [state.floorId]: { entries, cursor: entries.length - 1 },
          },
        };
      });
      return true;
    },
    setFloor: (id) => {
      if (id === get().floorId) {
        return true;
      }
      if (unfinished(get())) {
        set({ message: 'Draft changes pending. Apply or discard before changing floor.' });
        return false;
      }
      if (!get().document.floors.some((floor) => floor.source.id === id)) {
        return false;
      }
      set({ floorId: id, selection: null, tool: 'select', pointer: null, focusId: null });
      return true;
    },
    setTool: (tool, recipe) => {
      if (unfinished(get())) {
        set({ message: 'Apply or discard the unfinished edit before changing tool.' });
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
    cancel: () =>
      set((state) => ({
        selection:
          state.draftHistory[state.floorId] &&
          (state.draftHistory[state.floorId]!.undo.length ||
            state.draftHistory[state.floorId]!.redo.length)
            ? state.draftHistory[state.floorId]!.base.selection
            : state.selection,
        tool: 'select',
        drawing: [],
        pointer: null,
        pendingObject: null,
        pendingZone: null,
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
              ...withPreset(createObject(state.recipe, [0, 0]), state.presetId),
              yawRadians: state.placementYaw,
            }
          : selected;
      set({
        pointer:
          pointer && object && ['place', 'move', 'duplicate'].includes(state.tool)
            ? snapCirculation(
                { ...object, position: snapBoothPosition(object, floor.objects, pointer) },
                floor,
              ).position
            : pointer,
      });
    },
    patchObject: (updates) => {
      const state = get(),
        original = activeFloor(state).objects.find((object) => object.id === state.selection?.id);
      if (original) {
        if (state.pendingFloor || state.pendingRemoval || state.pendingZone) {
          state.notify('Apply or discard the unfinished edit first.');
          return;
        }
        const pendingObject = { ...(state.pendingObject ?? original), ...updates, managed: true };
        if (updates.position && state.tool === 'move') {
          pendingObject.position = snapBoothPosition(
            pendingObject,
            activeFloor(state).objects,
            pendingObject.position,
          );
          pendingObject.position = snapCirculation(pendingObject, activeFloor(state)).position;
        }
        state.stage({ pendingObject });
      }
    },
    patchZone: (updates) => {
      const state = get(),
        original = activeFloor(state).zones.find((zone) => zone.id === state.selection?.id);
      if (original) {
        if (state.pendingFloor || state.pendingRemoval || state.pendingObject) {
          state.notify('Apply or discard the unfinished edit first.');
          return;
        }
        state.stage({ pendingZone: { ...(state.pendingZone ?? original), ...updates } });
      }
    },
    patchFloor: (updates) => {
      const state = get();
      if (
        state.pendingObject ||
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
      if (state.selection?.kind === 'zone' && ['move', 'duplicate'].includes(state.tool)) {
        const originalZone = floor.zones.find((zone) => zone.id === state.selection?.id);
        if (!originalZone) {
          return false;
        }
        const bounds = polygonBounds(originalZone.polygon),
          cx = (bounds.minX + bounds.maxX) / 2,
          cz = (bounds.minZ + bounds.maxZ) / 2;
        const zone = {
          ...originalZone,
          polygon: originalZone.polygon.map(([x, z]): [number, number] => [
            x + point[0] - cx,
            z + point[1] - cz,
          ]),
          ...(state.tool === 'duplicate'
            ? {
                id: crypto.randomUUID(),
                label: uniqueName(`${originalZone.label} Copy`, floorNames(floor)),
              }
            : {}),
        };
        if (!insideBoundary(zone.polygon, floor.boundary)) {
          set({ message: 'Keep the zone inside the floor.' });
          return false;
        }
        if (
          !get().commitFloor({
            ...floor,
            zones: [...floor.zones.filter((item) => item.id !== zone.id), zone],
          })
        ) {
          return false;
        }
        set({
          selection: { kind: 'zone', id: zone.id },
          tool: 'select',
          message: 'Zone placement applied.',
        });
        return true;
      }
      const original = floor.objects.find((object) => object.id === state.selection?.id);
      if (['move', 'duplicate'].includes(state.tool) && !original) {
        state.notify('Select an object or zone before moving or duplicating.');
        return false;
      }
      let object: PlanObject;
      let members: PlanObject[];
      if ((state.tool === 'move' || state.tool === 'duplicate') && original) {
        object = { ...original, position: point, managed: true };
        members = transformGroup(floor, original, object);
        if (state.tool === 'duplicate') {
          const groupId = original.groupId ? crypto.randomUUID() : '';
          const names = floorNames(floor),
            numbers = floor.objects.map((item) => item.boothNumber);
          let anchorId = '';
          members = members.map((member) => {
            const id = crypto.randomUUID();
            if (member.id === original.id) {
              anchorId = id;
            }
            const name = uniqueName(`${member.name} Copy`, names);
            const boothNumber = uniqueName(member.boothNumber || 'B001', numbers);
            names.push(name);
            numbers.push(boothNumber);
            return {
              ...member,
              id,
              name,
              boothNumber,
              groupId,
              portalId: '',
              connectsFloorIds: [],
              legacyPoiId: undefined,
            };
          });
          object = members.find((member) => member.id === anchorId)!;
        }
      } else {
        object = withPreset(
          createObject(state.recipe, point, floor.objects, floorNames(floor)),
          state.presetId,
        );
        object.yawRadians = state.placementYaw;
        members = [object];
      }
      const snapped = snapCirculation(
        { ...object, position: snapBoothPosition(object, floor.objects, object.position) },
        floor,
      ).position;
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
        message: `${object.name} placed.`,
        tool: state.tool === 'move' ? 'select' : state.tool,
      });
      return true;
    },
    apply: () => {
      const state = get(),
        floor = activeFloor(state);
      if (state.pendingRemoval) {
        const target = state.pendingRemoval;
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
            polygon: points,
          };
          if (!get().commitFloor({ ...floor, zones: [...floor.zones, zone] })) {
            return false;
          }
          set({ selection: { kind: 'zone', id: zone.id } });
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
          set({ selection: { kind: 'object', id: object.id } });
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
    remove: (selection = get().selection ?? undefined) => {
      if (!selection) {
        return;
      }
      if (unfinished(get())) {
        get().notify('Apply or discard the unfinished edit before removing an item.');
        return;
      }
      get().stage({ pendingRemoval: selection, selection });
      set({ message: 'Removal preview. Apply to save, or Discard to restore.', tool: 'select' });
    },
    undo: () => {
      const state = get();
      const draft = state.draftHistory[state.floorId],
        prior = draft?.undo.at(-1);
      if (draft && prior) {
        set({
          ...prior,
          draftHistory: {
            ...state.draftHistory,
            [state.floorId]: {
              ...draft,
              undo: draft.undo.slice(0, -1),
              redo: [...draft.redo, draftSnapshot(state)],
            },
          },
          message: 'Undid draft step.',
        });
        return;
      }
      if (unfinished(state)) {
        set({ message: 'Apply or discard unfinished changes before undo.' });
        return;
      }
      set(restoreSavedStep(state, 'undo'));
    },
    redo: () => {
      const state = get(),
        history = state.history[state.floorId];
      const draft = state.draftHistory[state.floorId],
        later = draft?.redo.at(-1);
      if (draft && later) {
        set({
          ...later,
          draftHistory: {
            ...state.draftHistory,
            [state.floorId]: {
              ...draft,
              undo: [...draft.undo, draftSnapshot(state)],
              redo: draft.redo.slice(0, -1),
            },
          },
          message: 'Redid draft step.',
        });
        return;
      }
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
      const state = get(),
        current = activeFloor(state),
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
      const state = get(),
        floor = activeFloor(state),
        object = floor.objects.find((item) => item.id === state.selection?.id);
      if (unfinished(state) || !object?.portalId || targetFloor === state.floorId) {
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
    markSaved: (revision) =>
      set((state) => ({
        savedRevision: Math.max(state.savedRevision, revision),
        saveState: state.revision === revision ? 'Saved' : 'Unsynced',
      })),
  }));
}
export type StudioStore = ReturnType<typeof createStudioStore>;
export { resizeObject, rectangle };
