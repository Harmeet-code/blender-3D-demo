import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Layers,
  Package,
  Navigation,
  Undo2,
  Redo2,
  Save,
  Plus,
  Trash2,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  MousePointer2,
  Pentagon,
  Square,
  Copy,
  Lock,
  Move,
  Maximize2,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StudioPersistence, localDraftKey } from '../api/persistence.ts';
import { activeFloor, createStudioStore, unfinished, type StudioStore } from '../model/store.ts';
import { decodeLayout, encodeLayout } from '../model/adapter.ts';
import { inventory } from '../model/inventory.ts';
import { resolveEditorShortcut, isEditableTarget } from '../model/shortcuts.ts';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from 'zustand';
import { isBooth, isConnector } from '../model/types.ts';
import type { PlanDocument } from '../model/types.ts';
import type { BuildingLayout } from '@/features/building/model/building-schema.ts';
import { Inspector } from './Inspector.tsx';
import { FloorSetupPanel, type FloorSetupDraftController } from './FloorSetupPanel.tsx';
import { FloorCanvas } from './FloorCanvas.tsx';
import { useWayfindingRoute } from '../wayfinding/navigation/use-wayfinding-route.ts';
import { selectActiveResult, useWayfindingStore } from '../wayfinding/store/wayfinding-store.ts';
import { usePlaybackStore } from '../wayfinding/store/playback-store.ts';
import type { WalkableZone } from '../wayfinding/model/zone-schema.ts';
import { BoothDetails, CameraHud, ViewOptions, useBoothTour } from './ViewerPanel.tsx';
import { initialView } from '../model/view.ts';
import { useStudioDebug } from '../hooks/use-studio-debug.ts';
import { useBuilderRouter } from '../shell/router.tsx';
import type { BuilderRoute } from '../shell/routes.ts';
import { MiniatureVenueLoading, type BuilderLoadingPhase } from './BuilderLoading.tsx';
import { PlaybackHUD } from '../wayfinding/ui/PlaybackHUD.tsx';
import { Minimap } from '../wayfinding/rendering/Minimap.tsx';
import { toast } from 'sonner';
import '../styles.css';

const categories = ['Booths', 'Structure', 'Furniture', 'Services', 'Navigation', 'Connectors'] as const;
type Category = (typeof categories)[number];
const categoryFor = (category: string): Category => {
  if (category === 'Connections') return 'Connectors';
  if (category === 'Structures') return 'Structure';
  if (category === 'Amenities') return 'Services';
  return categories.includes(category as Category) ? (category as Category) : 'Services';
};

type SidebarSectionId = 'selection' | 'floor' | 'walkable-zones' | 'connections' | 'directions' | 'shortcuts';
const sidebarSectionIds: SidebarSectionId[] = ['selection', 'floor', 'walkable-zones', 'connections', 'directions', 'shortcuts'];
const defaultSidebarSections: Record<SidebarSectionId, boolean> = {
  selection: true,
  floor: true,
  'walkable-zones': false,
  connections: false,
  directions: true,
  shortcuts: false,
};

function SidebarSection({ id, title, open, onToggle, children }: {
  id: SidebarSectionId;
  title: string;
  open: boolean;
  onToggle: (id: SidebarSectionId) => void;
  children: React.ReactNode;
}) {
  return (
    <section id={`fp-sidebar-${id}`} className="fp-sidebar-section">
      <button
        type="button"
        className="fp-sidebar-section-heading"
        aria-expanded={open}
        aria-controls={`fp-sidebar-content-${id}`}
        onClick={() => onToggle(id)}
      >
        <span>{title}</span>
        <ChevronDown size={15} className={open ? '' : 'is-collapsed'} aria-hidden="true" />
      </button>
      <div id={`fp-sidebar-content-${id}`} className="fp-sidebar-section-content" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

function InventoryPanel({ store, search, setSearch, navigationMode, manageOnly = false }: {
  store: StudioStore;
  search: string;
  setSearch: (value: string) => void;
  navigationMode: boolean;
  manageOnly?: boolean;
}) {
  // The inventory only reacts to the active tool and the placed counts, not to the pointer.
  const state = useStore(
    store,
    useShallow((value) => ({
      tool: value.tool,
      recipe: value.recipe,
      document: value.document,
      floorId: value.floorId,
      beginPlacement: value.beginPlacement,
    })),
  );
  const floor = activeFloor(state);
  const placedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const object of floor.objects) {
      counts.set(object.recipe, (counts.get(object.recipe) ?? 0) + 1);
    }
    return counts;
  }, [floor.objects]);
  return (
    <div className="fp-inventory-panel">
      <div className="fp-search">
        <Search size={15} />
        <Input aria-label="Search inventory" placeholder="Search assets…" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {navigationMode ? (
        <p className="fp-muted">Navigation mode is for walkable areas and route testing. Switch back to place objects.</p>
      ) : categories.map((category) => {
        const assets = inventory.filter((item) => categoryFor(item.category) === category && item.name.toLowerCase().includes(search.toLowerCase()));
        if (!assets.length) return null;
        return (
          <section key={category} className="fp-inventory-category" aria-label={category}>
            <h3>{category}</h3>
            <div className="fp-inventory-grid">
              {assets.map((item) => {
                const content = <>
                  <span className={`fp-recipe-preview fp-preview-${item.id}`} style={{ '--recipe-color': item.color } as React.CSSProperties}>
                    {item.category === 'Connectors' || item.category === 'Connections' ? <Layers size={26} /> : <Package size={26} />}
                  </span>
                  <strong>{item.name}</strong>
                  <small>{item.dimensions[0]} × {item.dimensions[2]} m</small>
                </>;
                return manageOnly ? (
                  <article key={item.id} className="fp-inventory-item fp-inventory-item-readonly" aria-label={item.name}>
                    {content}
                  </article>
                ) : (
                  <button
                    key={item.id}
                    draggable
                    className={state.tool === 'place' && state.recipe === item.id ? 'fp-inventory-item active' : 'fp-inventory-item'}
                    aria-label={`Place ${item.name}`}
                    aria-pressed={state.tool === 'place' && state.recipe === item.id}
                    onClick={() => state.beginPlacement(item.id)}
                    onDragStart={(event) => {
                      if (unfinished(store.getState())) { event.preventDefault(); toast.error('Finish or cancel the current action first.'); return; }
                      state.beginPlacement(item.id);
                      event.dataTransfer.setData('application/x-floor-plan-recipe', item.id);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    {content}
                    <Badge variant="outline">{placedCounts.get(item.id) ?? 0} placed</Badge>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {!manageOnly && !navigationMode && <p className="fp-muted fp-library-note">Choose an asset, then click the floor to place it. Existing assets only.</p>}
    </div>
  );
}

function SelectionActions({ store, anchor, onCustomize, navigationMode }: { store: StudioStore; anchor: { x: number; y: number; width: number; height: number } | null; onCustomize: () => void; navigationMode: boolean }) {
  const actionRef = useRef<HTMLDivElement>(null);
  const [actionSize, setActionSize] = useState<[number, number]>([0, 0]);
  // The floating toolbar only reacts to the current selection, not to the pointer preview.
  const state = useStore(
    store,
    useShallow((value) => ({
      selection: value.selection,
      selectionSet: value.selectionSet,
      document: value.document,
      floorId: value.floorId,
      setTool: value.setTool,
      beginDuplicate: value.beginDuplicate,
      toggleLock: value.toggleLock,
      remove: value.remove,
      select: value.select,
    })),
  );
  const selection = state.selection;
  useLayoutEffect(() => {
    const element = actionRef.current;
    if (!element) return;
    // Keep the previous tuple when the size is unchanged so the observer never
    // schedules a render that only re-commits the same measurement.
    const measure = () =>
      setActionSize((current) =>
        current[0] === element.offsetWidth && current[1] === element.offsetHeight
          ? current
          : [element.offsetWidth, element.offsetHeight],
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selection?.id, navigationMode]);
  if (!selection || navigationMode) return null;
  const selected = selection.kind === 'object'
    ? activeFloor(state).objects.find((item) => item.id === selection.id)
    : activeFloor(state).zones.find((item) => item.id === selection.id);
  if (!selected) return null;
  const selectedObject =
    selection.kind === 'object'
      ? activeFloor(state).objects.find((item) => item.id === selection.id)
      : undefined;
  const selectedLocked = selected?.locked === true;
  const canLock = selection.kind === 'zone' || !!selectedObject?.managed;
  const lockLabel = selectedLocked ? 'Unlock selected item' : 'Lock selected item';
  const removeSelected = () => {
    const count = store.getState().selectionSet.length || 1;
    const before = store.getState().revision;
    store.getState().remove();
    const latest = store.getState();
    if (latest.revision > before) {
      toast.success(latest.message || (count > 1 ? 'Selected items deleted.' : 'Item deleted.'), {
        action: { label: 'Undo', onClick: () => store.getState().undo() },
      });
    } else if (latest.message.includes('locked')) {
      toast.error(latest.message);
    }
  };
  const toolbarWidth = actionSize[0] || 460;
  const toolbarHeight = actionSize[1] || 42;
  const style = anchor ? {
    left: Math.max(8, Math.min(anchor.x - toolbarWidth / 2, anchor.width - toolbarWidth - 8)),
    top: Math.max(8, Math.min(anchor.y - toolbarHeight - 12, anchor.height - toolbarHeight - 8)),
    maxWidth: 'calc(100% - 16px)',
  } : undefined;
  return (
    <div ref={actionRef} className="fp-selection-actions" style={style} role="toolbar" aria-label="Selected item actions">
      <Button size="sm" variant="ghost" title={selectedLocked ? 'Unlock the selected item before moving · Shift+M' : 'Move selected items · Shift+M'} aria-label="Move selected items" disabled={selectedLocked} onClick={() => state.setTool('move')}><Move size={15} />Move</Button>
      {selectedObject && <Button size="sm" variant="ghost" title={selectedLocked ? 'Unlock the selected item before resizing' : 'Resize selected item'} aria-label="Resize selected item" disabled={selectedLocked || selectedObject.recipe === 'avatar' || state.selectionSet.length > 1} onClick={() => state.setTool('resize')}><Maximize2 size={15} />Resize</Button>}
       <Button size="sm" variant="ghost" title={selectedLocked ? 'Unlock the selected item before duplicating · Shift+D' : 'Duplicate selected items · Shift+D'} aria-label="Duplicate selected items" disabled={selectedLocked} onClick={() => { if (!state.beginDuplicate()) { toast.error(store.getState().message); } }}><Copy size={15} />Duplicate</Button>
      {(selection.kind === 'zone' || selectedObject) && (
        <Button
          size="sm"
          variant={selectedLocked ? 'secondary' : 'ghost'}
          title={canLock ? lockLabel : 'Imported references cannot be locked in this editor'}
          aria-label={lockLabel}
          aria-pressed={selectedLocked}
          disabled={!canLock}
          onClick={() => state.toggleLock(selection)}
        >
          <Lock size={15} />{selectedLocked ? 'Unlock' : 'Lock'}
        </Button>
      )}
      <Button size="sm" variant="ghost" title={selectedLocked ? 'Unlock the selected item before deleting · Delete' : 'Delete selected items · Delete'} aria-label="Delete selected items" disabled={selectedLocked} onClick={removeSelected}><Trash2 size={15} />Delete</Button>
      <Button size="sm" variant="ghost" title="Customize selected item" aria-label="Customize selected item" onClick={onCustomize}><SlidersHorizontal size={15} />Customize</Button>
      <Button size="icon" variant="ghost" title="Close selection actions · Esc" aria-label="Close selection actions" onClick={() => state.select(null)}><X size={14} /></Button>
    </div>
  );
}

function NavigationRouteControls({ document, floorId, canWalk, blocked, notify }: { document: PlanDocument; floorId: string; canWalk: boolean; blocked: boolean; notify: (message: string) => void }) {
  const request = useWayfindingStore((item) => item.request);
  const status = useWayfindingStore((item) => item.status);
  const outcome = useWayfindingStore((item) => item.outcome);
  const setRequest = useWayfindingStore((item) => item.setRequest);
  const route = useWayfindingStore(selectActiveResult);
  const session = usePlaybackStore((item) => item.session);
  const notifiedFailure = useRef<string | null>(null);
  const choices = useMemo(() => document.floors.flatMap((planFloor) => [
    { key: `${planFloor.source.id}::spawn`, label: `${planFloor.source.name} · Entrance`, endpoint: { floorId: planFloor.source.id, kind: 'point' as const, point: [...planFloor.spawn] as [number, number] } },
    ...planFloor.objects.map((object) => ({ key: `${planFloor.source.id}::${object.id}`, label: `${object.name} · ${planFloor.source.name}`, endpoint: { floorId: planFloor.source.id, kind: 'item' as const, itemId: object.id } })),
  ]), [document]);
  const [startKey, setStartKey] = useState('');
  const [destKey, setDestKey] = useState('');
  const commit = (which: 'start' | 'dest', key: string) => {
    if (which === 'start') setStartKey(key); else setDestKey(key);
    const first = which === 'start' ? key : startKey;
    const second = which === 'dest' ? key : destKey;
    if (!first || !second) return;
    const start = choices.find((choice) => choice.key === first)?.endpoint;
    const dest = choices.find((choice) => choice.key === second)?.endpoint;
    if (!start || !dest) { notify('Choose valid route endpoints.'); return; }
    setRequest({ start, dest, accessibleOnly: request?.accessibleOnly ?? false, allowRestricted: request?.allowRestricted ?? false });
  };
  useEffect(() => {
    if (status !== 'failed' || !request || !outcome?.failure || notifiedFailure.current === outcome.failure) return;
    notifiedFailure.current = outcome.failure;
    notify(outcome.failure);
  }, [status, request, outcome, notify]);
  useEffect(() => () => {
    // Route requests are contextual to this setup panel. Do not leave an
    // unowned request running after Navigation mode/settings are dismissed.
    if (!usePlaybackStore.getState().session) useWayfindingStore.getState().clear();
  }, []);
  const clear = () => { usePlaybackStore.getState().exit(); useWayfindingStore.getState().clear(); setStartKey(''); setDestKey(''); notifiedFailure.current = null; };
  const startWalkthrough = () => {
    if (!startKey || !destKey || status !== 'ready' || !route || blocked) {
      notify('Choose a start and destination, then wait for a route before starting.');
      return;
    }
    usePlaybackStore.getState().begin(route, document, floorId);
    const result = usePlaybackStore.getState();
    if (!result.session && result.message) notify(result.message);
  };
   if (!canWalk) { return <div className="fp-route-test" aria-label="Route test"><strong>Test a route</strong><p className="fp-muted">This floor has no walkable zone yet.</p><Button size="sm" variant="outline" onClick={() => notify('Draw a walkable zone before generating a route.')}>Test route</Button></div>; }
  return <div className="fp-route-test" aria-label="Route test">
    <strong>Test a route</strong>
    <label>Start<select aria-label="Route start" value={startKey} onChange={(event) => commit('start', event.target.value)}><option value="">Choose a start…</option>{choices.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}</select></label>
    <label>Destination<select aria-label="Route destination" value={destKey} onChange={(event) => commit('dest', event.target.value)}><option value="">Choose a destination…</option>{choices.map((choice) => <option key={choice.key} value={choice.key}>{choice.label}</option>)}</select></label>
    {status === 'routing' && <p className="fp-muted" role="status">Finding a route…</p>}
    {route && !session && <Button size="sm" variant="outline" disabled={blocked || !startKey || !destKey || status !== 'ready'} onClick={startWalkthrough}>Start walkthrough</Button>}
    {session && <Button size="sm" variant="outline" onClick={() => usePlaybackStore.getState().exit()}>Stop walkthrough</Button>}
    {(request || session) && <Button size="sm" variant="ghost" onClick={clear}>Clear route</Button>}
  </div>;
}

function UnsavedNavigationDialog({ route, saveInProgress, onStay, onDiscard }: {
  route: BuilderRoute | null;
  saveInProgress: boolean;
  onStay: () => void;
  onDiscard: () => void;
}) {
  return (
     <Dialog open={!!route} onOpenChange={(open) => { if (!open) { onStay(); } }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>
            Stay in the editor to keep working, or discard the draft and leave this page.
            {saveInProgress ? ' Save is still in progress.' : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onStay}>Stay</Button>
          <Button variant="destructive" disabled={saveInProgress} onClick={onDiscard}>Discard and leave</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StudioPage() {
  const router = useBuilderRouter();
  const eventId = new URLSearchParams(window.location.search).get('eventId')?.trim() || 'floor-plan-studio';
  const store = useMemo(() => createStudioStore(eventId), [eventId]);
  // The page subscribes only to what it renders. The pointer preview changes on every mouse
  // move, and re-rendering the whole editor for it made the authoring surface feel heavy.
  const state = useStore(
    store,
    useShallow((value) => ({
      document: value.document,
      floorId: value.floorId,
      selection: value.selection,
      selectionSet: value.selectionSet,
      tool: value.tool,
      recipe: value.recipe,
      drawing: value.drawing,
      pendingObject: value.pendingObject,
      pendingObjects: value.pendingObjects,
      pendingZone: value.pendingZone,
      pendingZones: value.pendingZones,
      pendingFloor: value.pendingFloor,
      pendingRemoval: value.pendingRemoval,
      revision: value.revision,
      savedRevision: value.savedRevision,
      saveState: value.saveState,
      history: value.history,
      setTool: value.setTool,
      select: value.select,
      setFloor: value.setFloor,
      beginPlacement: value.beginPlacement,
      addFloor: value.addFloor,
      deleteFloor: value.deleteFloor,
      undo: value.undo,
      redo: value.redo,
      remove: value.remove,
      beginDuplicate: value.beginDuplicate,
      toggleLock: value.toggleLock,
    })),
  );
  const floor = activeFloor(state);
  const persistence = useMemo(() => new StudioPersistence(eventId, store), [eventId, store]);
  const [view, setView] = useState(() => ({ ...initialView, preview: router.route === 'preview' }));
  useBoothTour(store, view, setView);
  useStudioDebug(store);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [serverDraft, setServerDraft] = useState<BuildingLayout | null>(null);
  const [localDraft, setLocalDraft] = useState<BuildingLayout | null>(null);
  const [search, setSearch] = useState('');
  const [deleteFloor, setDeleteFloor] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(() => localStorage.getItem('fp-inventory-open') !== 'false');
  const [inspectorOpen, setInspectorOpen] = useState(() => localStorage.getItem('fp-inspector-open') !== 'false');
  const [sectionsOpen, setSectionsOpen] = useState<Record<SidebarSectionId, boolean>>(() =>
    Object.fromEntries(sidebarSectionIds.map((id) => {
      const remembered = localStorage.getItem(`fp-sidebar:${id}:open`);
      return [id, remembered === null ? defaultSidebarSections[id] : remembered === 'true'];
    })) as Record<SidebarSectionId, boolean>,
  );
  const setSectionOpen = useCallback((id: SidebarSectionId, open: boolean) => {
    setSectionsOpen((current) => current[id] === open ? current : { ...current, [id]: open });
  }, []);
  const toggleSection = useCallback((id: SidebarSectionId) => {
    setSectionsOpen((current) => ({ ...current, [id]: !current[id] }));
  }, []);
  const floorDraftController = useRef<FloorSetupDraftController | null>(null);
  const [floorDraftDirty, setFloorDraftDirty] = useState(false);
  const attachFloorDraftController = useCallback((controller: FloorSetupDraftController | null) => {
    floorDraftController.current = controller;
    setFloorDraftDirty(!!controller?.hasDraft);
  }, []);
  const [navigationMode, setNavigationMode] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<BuilderRoute | null>(null);
  const [showFloorSetup, setShowFloorSetup] = useState(false);
  const [restoredFloorEvent, setRestoredFloorEvent] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [phase, setPhase] = useState<BuilderLoadingPhase>('floor');
  const [hasStableFrame, setHasStableFrame] = useState(false);
  const [readinessGeneration, setReadinessGeneration] = useState(0);
  const [actionAnchor, setActionAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const playbackActive = usePlaybackStore((playbackState) => !!playbackState.session);
  const wayfindingZones = useMemo<WalkableZone[]>(() => state.document.floors.flatMap((planFloor) => planFloor.zones.filter((zone) => zone.type === 'walkable').map((zone) => ({ id: zone.id, floorId: planFloor.source.id, name: zone.label || 'Walkable zone', type: 'general' as const, polygon: zone.polygon as [number, number][], holes: [], revision: state.revision }))), [state.document, state.revision]);
  const notifyRoute = useCallback((message: string) => {
    store.getState().notify(message);
    toast.error(message, message.toLowerCase().includes('walkable zone') ? {
      action: {
        label: 'Draw walkable zone',
        onClick: () => {
          setNavigationMode(true);
          store.getState().setTool('zone-rectangle');
        },
      },
    } : undefined);
  }, [store]);
  useWayfindingRoute(state.document, state.revision, wayfindingZones, notifyRoute);
  const saveExplicitly = useCallback(async () => {
    const draft = floorDraftController.current;
    if (draft?.hasDraft && draft.invalid) {
      setSectionOpen('floor', true);
      window.requestAnimationFrame(() => floorDraftController.current?.focusInvalid());
      toast.error('Enter valid floor dimensions before saving.');
      return;
    }
    const current = store.getState();
    if (draft?.hasDraft) {
      if (!draft.apply()) {
        const latest = store.getState();
        setSectionOpen('floor', true);
        window.requestAnimationFrame(() => floorDraftController.current?.focusInvalid());
        toast.error(latest.message || 'Apply the floor edits before saving.');
        return;
      }
    } else if (unfinished(current) && !current.apply()) {
      const latest = store.getState();
      const section: SidebarSectionId = latest.pendingFloor
        ? 'floor'
        : latest.pendingZone || latest.selection?.kind === 'zone'
          ? 'walkable-zones'
          : 'selection';
      setSectionOpen(section, true);
      window.requestAnimationFrame(() => {
        const invalid = document.querySelector<HTMLElement>('#fp-inspector [aria-invalid="true"]');
        invalid?.focus();
        invalid?.scrollIntoView({ block: 'nearest' });
      });
      toast.error(latest.message || 'Resolve the pending edit before saving.');
      return;
    }
    const ready = store.getState();
    if (unfinished(ready)) {
      toast.error(ready.message || 'Resolve the pending edit before saving.');
      return;
    }
    const revision = ready.revision;
    try {
      await persistence.saveDraft();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the floor plan. Your edits are still here.');
      return;
    }
    const latest = store.getState();
    if (latest.saveState === 'Saved' && latest.savedRevision >= revision) {
      if (latest.revision === latest.savedRevision) {
        localStorage.removeItem(localDraftKey(eventId));
        setLocalDraft(null);
      }
      toast.success('Floor plan saved.');
    } else { toast.error(latest.message || 'Could not save the floor plan. Your edits are still here.'); }
  }, [eventId, persistence, setSectionOpen, store]);

  const requestNavigation = useCallback((next: BuilderRoute) => {
    if (next === router.route) { return; }
    const current = store.getState();
    if (unfinished(current) || floorDraftController.current?.hasDraft || current.revision !== current.savedRevision) {
      setPendingNavigation(next);
      return;
    }
    router.navigate(next);
  }, [router, store]);
  const discardAndNavigate = useCallback(() => {
    const current = store.getState();
    if (!current.discardUnsaved()) {
      toast.error(store.getState().message || 'Wait for Save to finish before discarding.');
      return;
    }
    floorDraftController.current?.discard();
    localStorage.removeItem(localDraftKey(eventId));
    setLocalDraft(null);
    const next = pendingNavigation;
    setPendingNavigation(null);
    if (next) { router.navigate(next); }
  }, [eventId, pendingNavigation, router, store]);

  useEffect(() => setView((current) => ({ ...current, preview: router.route === 'preview', touring: false })), [router.route]);
  useEffect(() => { localStorage.setItem('fp-inventory-open', String(inventoryOpen)); }, [inventoryOpen]);
  useEffect(() => { localStorage.setItem('fp-inspector-open', String(inspectorOpen)); }, [inspectorOpen]);
  useEffect(() => { for (const id of sidebarSectionIds) { localStorage.setItem(`fp-sidebar:${id}:open`, String(sectionsOpen[id])); } }, [sectionsOpen]);
  useEffect(() => {
    if (loading || restoredFloorEvent === eventId) { return; }
    const remembered = localStorage.getItem(`fp-floor:${eventId}`);
    if (remembered && state.document.floors.some((item) => item.source.id === remembered) && remembered !== state.floorId) { state.setFloor(remembered); }
    setRestoredFloorEvent(eventId);
  }, [eventId, loading, restoredFloorEvent, state.document.floors, state.floorId]);
  useEffect(() => { if (!loading && restoredFloorEvent === eventId) { localStorage.setItem(`fp-floor:${eventId}`, state.floorId); } }, [eventId, loading, restoredFloorEvent, state.floorId]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError(null); setHasStableFrame(false); setPhase('floor');
    setReadinessGeneration((generation) => generation + 1);
    try {
      const cached = localStorage.getItem(localDraftKey(eventId));
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.eventId === eventId && parsed.layout) { setLocalDraft(parsed.layout); }
      }
    } catch { toast.error('A local recovery draft could not be read.'); }
    void persistence.load(controller.signal).then((loaded) => {
      if (!controller.signal.aborted) {
        setServerDraft(loaded.draft);
        if (loaded.restoredDraft) {
          try {
            const cached = localStorage.getItem(localDraftKey(eventId));
            const parsed = cached ? JSON.parse(cached) : null;
            if (
              parsed?.eventId === eventId &&
              JSON.stringify(parsed.layout) === JSON.stringify(loaded.restoredDraft)
            ) {
              localStorage.removeItem(localDraftKey(eventId));
              setLocalDraft(null);
            }
          } catch { /* Keep an unreadable local recovery available for explicit dismissal. */ }
        }
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) { setLoadError(error instanceof Error ? error.message : 'Could not load the floor plan.'); }
    }).finally(() => {
      if (!controller.signal.aborted) { setLoading(false); setPhase('assets'); }
    });
    return () => controller.abort();
  }, [eventId, persistence, retry]);
  useEffect(() => {
    if (loading || state.revision === state.savedRevision) { return; }
    try { localStorage.setItem(localDraftKey(eventId), JSON.stringify({ eventId, layout: encodeLayout(state.document), updatedAt: Date.now() })); }
    catch { toast.error('Local recovery could not be written.'); }
  }, [eventId, loading, state.revision, state.savedRevision, state.document]);
  useEffect(() => {
    if (loading || loadError) { return; }
    const empty = state.document.floors.length === 1 && state.document.floors[0]?.objects.length === 0 && state.document.floors[0]?.zones.length === 0;
    const dismissed = localStorage.getItem(`fp-floor-setup-dismissed:${eventId}`) === 'true';
    if (empty && !dismissed) { setShowFloorSetup(true); setSectionOpen('floor', true); }
  }, [eventId, loading, loadError, state.document, setSectionOpen]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      const current = store.getState();
      if (unfinished(current) || floorDraftController.current?.hasDraft || current.revision !== current.savedRevision) { event.preventDefault(); }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [store]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (router.route === 'inventory') { return; }
      const command = resolveEditorShortcut(event, isEditableTarget(event.target));
      if (command === 'save') {
        event.preventDefault();
        void saveExplicitly();
        return;
      }
      if (view.preview) {
        if (event.key === 'Escape' && !isEditableTarget(event.target)) {
          event.preventDefault();
          usePlaybackStore.getState().exit();
          requestNavigation('builder');
        }
        return;
      }
      const current = store.getState();
      if (!command) { return; }
      if (command === 'finish' && !unfinished(current)) { return; }
      event.preventDefault();
      if (command === 'undo') { current.undo(); return; }
      if (command === 'redo') { current.redo(); return; }
      if (command === 'delete') {
        if (current.selection) {
          const count = current.selectionSet.length || 1, before = current.revision;
          current.remove();
          const latest = store.getState();
          if (latest.revision > before) {
            toast.success(latest.message || (count > 1 ? 'Selected items deleted.' : 'Item deleted.'), { action: { label: 'Undo', onClick: () => store.getState().undo() } });
          } else if (latest.message.includes('locked')) {
            toast.error(latest.message);
          }
        }
        return;
      }
      if (command === 'cancel') { current.cancel(); usePlaybackStore.getState().exit(); return; }
       if (command === 'duplicate') { if (!current.beginDuplicate()) { toast.error(store.getState().message); } return; }
      if (command === 'finish' || command === 'apply') { current.apply(); return; }
      if (command === 'rectangle') { current.setTool(navigationMode ? 'zone-rectangle' : 'rectangle'); return; }
      if (command === 'polygon') { current.setTool(navigationMode ? 'zone-polygon' : 'polygon'); return; }
      if (command === 'preset') { current.choosePreset(); return; }
      if (command === 'poi') { current.cyclePoi(); return; }
      if (command === 'resize' && (current.selection?.kind !== 'object' || current.selectionSet.length > 1)) { return; }
      if (command === 'move' || command === 'resize') {
        const active = activeFloor(current);
        const locked = current.selection?.kind === 'object'
          ? active.objects.find((object) => object.id === current.selection?.id)?.locked
          : current.selection?.kind === 'zone'
            ? active.zones.find((zone) => zone.id === current.selection?.id)?.locked
            : false;
        if (locked) {
          const message = `${current.selection?.kind === 'object' ? 'Object' : 'Zone'} is locked. Unlock it before editing.`;
          toast.error(message);
          current.notify(message);
          return;
        }
      }
      current.setTool(command);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [store, view.preview, router.route, navigationMode, saveExplicitly, requestNavigation]);

  const save = () => void saveExplicitly();
  const changeFloor = (id: string) => {
    const draft = floorDraftController.current;
    if (draft?.hasDraft && !draft.apply()) {
      setSectionOpen('floor', true);
      window.requestAnimationFrame(() => floorDraftController.current?.focusInvalid());
      toast.error(store.getState().message || 'Correct floor setup before switching floors.');
      return false;
    }
    if (!store.getState().setFloor(id)) {
      toast.error(store.getState().message || 'Finish the active edit before switching floors.');
      return false;
    }
    return true;
  };
  const selectedObject = state.selection?.kind === 'object' ? floor.objects.find((object) => object.id === state.selection?.id) : null;
  const selectedZone = state.selection?.kind === 'zone' ? floor.zones.find((zone) => zone.id === state.selection?.id) : null;
  const selectedLocked = selectedObject?.locked === true || selectedZone?.locked === true;
  const walkableAvailable = wayfindingZones.some((zone) => zone.floorId === floor.source.id && zone.polygon.length >= 3);
  const hasUnsavedChanges = state.revision !== state.savedRevision || floorDraftDirty || unfinished(state) || state.saveState === 'Error';
  const commandModifier = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl';
  const restore = (layout: BuildingLayout) => {
    try {
      const restored = decodeLayout(layout);
      if (restored.baseline.buildingId !== eventId) { throw new Error('This recovery draft belongs to a different project.'); }
      setHasStableFrame(false); setPhase('assets'); setReadinessGeneration((generation) => generation + 1);
      store.getState().load(restored, true); setLocalDraft(null); setServerDraft(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Draft invalid.'); }
  };
  const beginPolygon = () => store.getState().setTool(navigationMode ? 'zone-polygon' : 'polygon');
  const openCustomize = (id?: string) => {
    if (id && !store.getState().select({ kind: 'object', id })) {
      toast.error(store.getState().message || 'This object cannot be customized.');
      return;
    }
    setInspectorOpen(true);
    setSectionOpen('selection', true);
    window.requestAnimationFrame(() => document.getElementById('fp-sidebar-selection')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };

  if (router.route === 'inventory') {
    return <main className="fp-studio fp-inventory-route"><header className="fp-header"><h1>Asset inventory</h1><Button variant="outline" onClick={() => requestNavigation('builder')}>Back to builder</Button></header><InventoryPanel store={store} search={search} setSearch={setSearch} navigationMode={false} manageOnly /><p className="fp-muted">Reusable asset management is limited in this phase. No assets can be added here.</p><UnsavedNavigationDialog route={pendingNavigation} saveInProgress={state.saveState === 'Saving'} onStay={() => setPendingNavigation(null)} onDiscard={discardAndNavigate} /></main>;
  }

  return (
    <main className={`fp-studio${view.preview ? ' fp-preview-mode' : ''}`} data-testid="floor-plan-studio">
      <header className="fp-header fp-header-compact">
        <div className="fp-brand"><span className="fp-mark"><Layers size={20} /></span><div><h1>Floor plan builder</h1><p>{eventId}</p></div></div>
        <div className="fp-header-actions">
          <Button size="sm" variant={router.route === 'builder' ? 'secondary' : 'ghost'} onClick={() => requestNavigation('builder')}>Builder</Button>
          <Button size="sm" variant={router.route === 'preview' ? 'secondary' : 'ghost'} onClick={() => requestNavigation('preview')}>Preview</Button>
          <Label className="fp-floor-select-label">Floor<select aria-label="Select floor" value={state.floorId} onChange={(event) => changeFloor(event.target.value)}>{state.document.floors.map((item) => <option key={item.source.id} value={item.source.id}>{item.source.name}</option>)}</select></Label>
          <Button size="sm" variant={navigationMode ? 'secondary' : 'outline'} aria-pressed={navigationMode} onClick={() => { setNavigationMode((value) => !value); state.setTool('select'); }}> <Navigation size={15} />Navigation</Button>
          <Button size="icon" variant="ghost" title={`Undo · ${commandModifier}+Z`} aria-label="Undo" disabled={!state.history[state.floorId]?.undo.length} onClick={state.undo}><Undo2 size={17} /></Button>
          <Button size="icon" variant="ghost" title={`Redo · ${commandModifier}+Shift+Z`} aria-label="Redo" disabled={!state.history[state.floorId]?.redo.length} onClick={state.redo}><Redo2 size={17} /></Button>
          <span className={`fp-save-status fp-save-${hasUnsavedChanges ? 'unsynced' : state.saveState.toLowerCase()}`} role="status">{state.saveState === 'Saving' ? 'Saving…' : hasUnsavedChanges ? 'Unsaved changes' : 'Saved'}</span>
          <Button size="sm" title={`Save · ${commandModifier}+S`} onClick={save} disabled={loading || state.saveState === 'Saving'}><Save size={15} />Save</Button>
        </div>
      </header>
      <div className={`fp-workspace ${inventoryOpen ? '' : 'fp-inventory-collapsed'} ${inspectorOpen ? '' : 'fp-inspector-closed'}`}>
        <aside className="fp-library" aria-label="Asset inventory">
          <div className="fp-panel-heading"><div><span className="fp-eyebrow">ASSETS</span><h2>Inventory</h2></div><Button size="icon" variant="ghost" aria-label={inventoryOpen ? 'Collapse inventory' : 'Expand inventory'} onClick={() => setInventoryOpen((open) => !open)}>{inventoryOpen ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}</Button></div>
          {inventoryOpen && <InventoryPanel store={store} search={search} setSearch={setSearch} navigationMode={navigationMode} />}
        </aside>
        <section className="fp-scene-column">
          {!view.preview && <div className="fp-toolbar fp-toolbar-compact">
            <Button size="sm" variant={state.tool === 'select' ? 'secondary' : 'ghost'} title="Select; Esc cancels the current drawing or gesture" onClick={() => state.setTool('select')}><MousePointer2 size={15} />Select</Button>
            {!navigationMode ? <>
              <Button size="sm" variant={state.tool === 'move' ? 'secondary' : 'ghost'} title={selectedLocked ? 'Unlock the selected item before moving · Shift+M' : 'Move selected items · Shift+M'} disabled={selectedLocked} onClick={() => state.setTool('move')}><Move size={15} />Move</Button>
              <Button size="sm" variant={state.tool === 'resize' ? 'secondary' : 'ghost'} title="Resize selected object · Shift+R; drag a handle, hold Shift to preserve aspect; Enter applies, Esc discards" disabled={!selectedObject || selectedObject.locked || selectedObject.recipe === 'avatar' || state.selectionSet.length > 1} onClick={() => state.setTool('resize')}><Maximize2 size={15} />Resize</Button>
              <Button size="sm" variant={state.tool === 'rectangle' ? 'secondary' : 'ghost'} title="Draw rectangular booth · Shift+B" onClick={() => state.setTool('rectangle')}><Square size={15} />Rectangle</Button>
              <Button size="sm" variant={state.tool === 'polygon' ? 'secondary' : 'ghost'} title="Draw polygon booth · Shift+P" onClick={beginPolygon}><Pentagon size={15} />Polygon booth</Button>
            </> : <>
              <Button size="sm" variant={state.tool === 'zone-rectangle' ? 'secondary' : 'ghost'} title="Draw walkable rectangle · Shift+Z" onClick={() => state.setTool('zone-rectangle')}><Square size={15} />Walkable area</Button>
              <Button size="sm" variant={state.tool === 'zone-polygon' ? 'secondary' : 'ghost'} title="Draw polygon area · Shift+P" onClick={() => state.setTool('zone-polygon')}><Pentagon size={15} />Polygon area</Button>
               <Button size="sm" variant="outline" onClick={() => { if (!walkableAvailable) { notifyRoute('Draw a walkable zone before testing a route.'); } else { setSectionOpen('directions', true); } }}>Test route</Button>
            </>}
          </div>}
           {(localDraft || serverDraft) && <div className="fp-recovery" role="status"><span>{localDraft ? 'Local recovery is available.' : 'A server draft is available.'}</span><Button size="sm" variant="outline" onClick={() => restore((localDraft ?? serverDraft)!)}>Restore</Button><Button size="sm" variant="ghost" onClick={() => { if (localDraft) { localStorage.removeItem(localDraftKey(eventId)); setLocalDraft(null); } else { setServerDraft(null); } }}>Dismiss</Button></div>}
          <div className="fp-viewport-wrap">
             <FloorCanvas store={store} view={view} onSelectionAnchor={setActionAnchor} onCustomizeObject={openCustomize} onStableFrame={() => { setHasStableFrame(true); setPhase('navigation'); }} readinessGeneration={readinessGeneration} showRouteLabels={false} onInteract={() => { if (view.touring) { setView((current) => ({ ...current, touring: false })); } }} />
            <MiniatureVenueLoading state={{ loading, phase, stableHighQualityFrame: hasStableFrame, error: loadError }} retry={() => setRetry((value) => value + 1)} />
            {!view.preview && !playbackActive && <SelectionActions store={store} anchor={actionAnchor} onCustomize={() => openCustomize()} navigationMode={navigationMode} />}
          </div>
          <footer className="fp-status-bar"><span>{floor.objects.length} objects · {floor.zones.length} areas</span><span>{state.saveState === 'Saving' ? 'Saving…' : hasUnsavedChanges ? 'Changes not saved' : 'All changes saved'}</span></footer>
        </section>
        <aside className="fp-inspector" id="fp-inspector" aria-label="Editor sidebar">
          <div className="fp-panel-heading">
            <div><span className="fp-eyebrow">PROPERTIES</span><h2>Customize</h2></div>
            <Button size="icon" variant="ghost" aria-label={inspectorOpen ? 'Collapse Customize sidebar' : 'Expand Customize sidebar'} title={inspectorOpen ? 'Collapse Customize sidebar' : 'Expand Customize sidebar'} onClick={() => setInspectorOpen((open) => !open)}>{inspectorOpen ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</Button>
          </div>
          {inspectorOpen && <>
          <SidebarSection id="selection" title="Selection" open={sectionsOpen.selection} onToggle={toggleSection}>
            {state.selection ? <div className="fp-context-panel">
              {state.selectionSet.length > 1 && <p className="fp-muted">{state.selectionSet.length} items selected. Move, rotate, duplicate, and delete act on the temporary selection; Customize edits the primary item.</p>}
              <Inspector store={store} onChangeFloor={changeFloor} />
              {selectedObject && isBooth(selectedObject) && <BoothDetails store={store} />}
              {selectedObject && isConnector(selectedObject.recipe) && <p className="fp-muted">Link this connector to a destination floor in its properties. Landing geometry is configured on the connected floor.</p>}
            </div> : <p className="fp-muted fp-sidebar-empty">Select an object or walkable zone, then choose Customize to edit its properties.</p>}
          </SidebarSection>
          <SidebarSection id="floor" title="Floor" open={sectionsOpen.floor} onToggle={toggleSection}>
            <div className="fp-context-panel">
              {showFloorSetup && <div className="fp-floor-setup-callout"><strong>Set up this floor</strong><p>Name it, set its dimensions, and optionally add a floor image.</p><Button size="sm" variant="ghost" onClick={() => { setShowFloorSetup(false); localStorage.setItem(`fp-floor-setup-dismissed:${eventId}`, 'true'); }}>Dismiss</Button></div>}
              <FloorSetupPanel key={floor.source.id} store={store} onDraftController={attachFloorDraftController} />
              <ViewOptions view={view} setView={setView} />
            </div>
          </SidebarSection>
          <SidebarSection id="walkable-zones" title="Walkable Zones" open={sectionsOpen['walkable-zones']} onToggle={toggleSection}>
            <div className="fp-context-panel">
              <p className="fp-muted">Walkable areas define where visitors can move. Zones remain polygon-edited and are never resized with object handles.</p>
              <div className="fp-row">
                <Button size="sm" variant="outline" title="Draw walkable rectangle · Shift+Z" onClick={() => { setNavigationMode(true); state.setTool('zone-rectangle'); }}>Rectangle</Button>
                <Button size="sm" variant="outline" title="Draw polygon walkable area · Shift+P" onClick={() => { setNavigationMode(true); state.setTool('zone-polygon'); }}>Polygon</Button>
              </div>
              {floor.zones.length ? <ul className="fp-sidebar-list">{floor.zones.map((zone) => <li key={zone.id}><Button size="sm" variant={state.selection?.id === zone.id ? 'secondary' : 'ghost'} title={zone.locked ? 'Locked zone · select here to unlock in Customize' : 'Select zone'} onClick={() => state.select({ kind: 'zone', id: zone.id })}>{zone.label || 'Walkable zone'} · {zone.type}{zone.locked ? ' · Locked' : ''}</Button></li>)}</ul> : <p className="fp-muted">No zones on this floor yet.</p>}
            </div>
          </SidebarSection>
          <SidebarSection id="connections" title="Connections" open={sectionsOpen.connections} onToggle={toggleSection}>
            <div className="fp-context-panel">
              <p className="fp-muted">Stairs, elevators, and escalators connect floors. Select a connector to edit its landing and floor links.</p>
              {floor.objects.filter((object) => isConnector(object.recipe)).length ? <ul className="fp-sidebar-list">{floor.objects.filter((object) => isConnector(object.recipe)).map((object) => <li key={object.id}><Button size="sm" variant={state.selection?.id === object.id ? 'secondary' : 'ghost'} onClick={() => state.select({ kind: 'object', id: object.id })}>{object.name} · {object.connectsFloorIds.length ? 'linked' : 'unlinked'}</Button></li>)}</ul> : <p className="fp-muted">No connectors on this floor yet.</p>}
            </div>
          </SidebarSection>
          <SidebarSection id="directions" title="Directions" open={sectionsOpen.directions} onToggle={toggleSection}>
            <div className="fp-context-panel">
              <NavigationRouteControls document={state.document} floorId={floor.source.id} canWalk={walkableAvailable} blocked={unfinished(state)} notify={notifyRoute} />
              <div className="fp-directions-camera"><CameraHud view={view} setView={setView} /></div>
              <PlaybackHUD document={state.document} placement="sidebar" lightingControls={false} />
              <div className="fp-minimap-sidebar"><Minimap floor={floor} placement="sidebar" /></div>
            </div>
          </SidebarSection>
          <SidebarSection id="shortcuts" title="Shortcuts" open={sectionsOpen.shortcuts} onToggle={toggleSection}>
            <dl className="fp-shortcut-list">
              <div><dt><kbd>{commandModifier}+S</kbd></dt><dd>Save the shared draft</dd></div>
              <div><dt><kbd>{commandModifier}+Z</kbd></dt><dd>Undo</dd></div>
              <div><dt><kbd>{commandModifier}+Shift+Z</kbd></dt><dd>Redo</dd></div>
              <div><dt><kbd>Enter</kbd></dt><dd>Finish an edit or drawing</dd></div>
              <div><dt><kbd>Esc</kbd></dt><dd>Cancel a drawing or active gesture; valid field edits stay in the shared draft</dd></div>
              <div><dt><kbd>Delete</kbd></dt><dd>Delete unlocked selected items; locked items stay</dd></div>
              <div><dt><kbd>Shift+D</kbd></dt><dd>Duplicate selection</dd></div>
              <div><dt><kbd>Shift+M</kbd></dt><dd>Move selection</dd></div>
              <div><dt><kbd>Shift+R</kbd></dt><dd>Resize selected object</dd></div>
              <div><dt><kbd>Shift+B</kbd></dt><dd>Draw rectangle</dd></div>
              <div><dt><kbd>Shift+P</kbd></dt><dd>Draw polygon</dd></div>
              <div><dt><kbd>Shift+T</kbd></dt><dd>Choose booth preset</dd></div>
              <div><dt><kbd>Shift+I</kbd></dt><dd>Cycle point-of-interest placement</dd></div>
              <div><dt><kbd>Shift+Z</kbd></dt><dd>Draw walkable rectangle</dd></div>
              <div><dt><kbd>Shift+X</kbd></dt><dd>Arm remove tool</dd></div>
              <div><dt><kbd>Space</kbd></dt><dd>Play / pause walkthrough</dd></div>
              <div><dt><kbd>← / →</kbd></dt><dd>Scrub walkthrough</dd></div>
            </dl>
            <p className="fp-muted">Numeric fields preview changes immediately. Other shortcuts are ignored while typing.</p>
          </SidebarSection>
          </>}
        </aside>
      </div>
      {!view.preview && <div className="fp-bottom-actions"><Button size="sm" variant="outline" onClick={state.addFloor}><Plus size={14} />Add floor</Button><Button size="sm" variant="ghost" aria-label="Delete current floor" disabled={state.document.floors.length < 2} onClick={() => setDeleteFloor(true)}><Trash2 size={14} />Delete floor</Button><Button size="sm" variant="ghost" onClick={() => requestNavigation('inventory')}>Manage assets</Button>{!navigationMode && <Button size="sm" variant="ghost" title={selectedLocked ? 'Unlock the selected item before duplicating' : 'Duplicate selection · Shift+D'} disabled={selectedLocked} onClick={() => { if (!store.getState().beginDuplicate()) { toast.error(store.getState().message); } }}><Copy size={14} />Duplicate <kbd>Shift+D</kbd></Button>}</div>}
      {state.tool === 'polygon' && state.drawing.length > 0 && <div className="fp-drawing-hint" role="status">Click to add booth corners · click first point, double-click, or press Enter to finish · Esc to cancel</div>}
      {deleteFloor && <div role="alertdialog" aria-modal="true" className="fp-confirm-dialog"><h2>Delete {floor.source.name}?</h2><p>This removes the floor and its assets from this document.</p><Button variant="outline" onClick={() => setDeleteFloor(false)}>Cancel</Button><Button variant="destructive" onClick={() => { state.deleteFloor(state.floorId); setDeleteFloor(false); }}>Delete floor</Button></div>}
      <UnsavedNavigationDialog route={pendingNavigation} saveInProgress={state.saveState === 'Saving'} onStay={() => setPendingNavigation(null)} onDiscard={discardAndNavigate} />
    </main>
  );
}
