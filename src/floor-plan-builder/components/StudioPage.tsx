import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  MousePointer2,
  Move,
  Copy,
  Square,
  Pentagon,
  Layers,
  Package,
  Navigation,
  Undo2,
  Redo2,
  Save,
  Plus,
  Trash2,
  Keyboard,
  Settings2,
  Check,
  ArrowUpRight,
  LogIn,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { venueLogin, venueSession } from '@/features/venue/model/venue-client.ts';
import { StudioPersistence, localDraftKey } from '../api/persistence.ts';
import { activeFloor, createStudioStore, unfinished, type StudioStore } from '../model/store.ts';
import { decodeLayout, encodeLayout, portalLanding } from '../model/adapter.ts';
import { inventory } from '../model/inventory.ts';
import { resolveShortcut, isEditableTarget } from '../model/shortcuts.ts';
import { StudioNavigator, type PlanRoute, type RoutePoint } from '../model/directions.ts';
import type { RecipeId, Tool } from '../model/types.ts';
import type { BuildingLayout } from '@/features/building/model/building-schema.ts';
import { Inspector, FloorProperties } from './Inspector.tsx';
import { FloorCanvas } from './FloorCanvas.tsx';
import { GroupingPanel } from './GroupingPanel.tsx';
import {
  BoothDetails,
  BoothDirectory,
  CameraHud,
  ViewOptions,
  useBoothTour,
} from './ViewerPanel.tsx';
import { initialView, statusColors } from '../model/view.ts';
import { boothPresets } from '../model/presets.ts';
import { useStudioDebug } from '../hooks/use-studio-debug.ts';
import '../styles.css';

function Section({
  title,
  icon,
  children,
  open = true,
  authoring = false,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  open?: boolean;
  authoring?: boolean;
}) {
  return (
    <details
      className={`fp-section${authoring ? ' fp-authoring-only' : ''}`}
      open={open}
      data-editor-section={title}
      tabIndex={-1}
    >
      <summary>
        {icon}
        <span>{title}</span>
        <span className="fp-section-chevron">⌄</span>
      </summary>
      <div className="fp-section-body">{children}</div>
    </details>
  );
}
const tools: { id: Tool; name: string; key?: string; icon: ReactNode }[] = [
  { id: 'select', name: 'Select', icon: <MousePointer2 /> },
  { id: 'rectangle', name: 'Rectangle booth', key: 'B', icon: <Square /> },
  { id: 'polygon', name: 'Polygon booth', key: 'P', icon: <Pentagon /> },
  { id: 'move', name: 'Move', key: 'M', icon: <Move /> },
  { id: 'resize', name: 'Resize', key: 'R', icon: <Settings2 /> },
  { id: 'duplicate', name: 'Duplicate', key: 'D', icon: <Copy /> },
];
function DrawingControls({ store }: { store: StudioStore }) {
  const state = store(),
    [x, setX] = useState(5),
    [z, setZ] = useState(5);
  return (
    <div className="fp-form">
      <div className="fp-two">
        <Label>
          X (m)
          <Input
            aria-label="Placement X"
            type="number"
            value={Number.isFinite(x) ? x : ''}
            aria-invalid={!Number.isFinite(x)}
            onChange={(event) => setX(event.target.value === '' ? NaN : Number(event.target.value))}
          />
        </Label>
        <Label>
          Z (m)
          <Input
            aria-label="Placement Z"
            type="number"
            value={Number.isFinite(z) ? z : ''}
            aria-invalid={!Number.isFinite(z)}
            onChange={(event) => setZ(event.target.value === '' ? NaN : Number(event.target.value))}
          />
        </Label>
      </div>
      <Label>
        Placement rotation (degrees)
        <Input
          aria-label="Placement rotation (degrees)"
          type="number"
          step={15}
          value={Number(((state.placementYaw * 180) / Math.PI).toFixed(2))}
          disabled={unfinished(state)}
          onChange={(event) => {
            if (event.target.value !== '') {
              state.setPlacementYaw((Number(event.target.value) * Math.PI) / 180);
            }
          }}
        />
      </Label>
      <div className="fp-row" aria-label="Placement rotation presets">
        {[0, 90, 180, 270].map((degrees) => (
          <Button
            key={degrees}
            size="sm"
            variant="outline"
            disabled={unfinished(state)}
            onClick={() => state.setPlacementYaw((degrees * Math.PI) / 180)}
          >
            {degrees}°
          </Button>
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          if (!Number.isFinite(x) || !Number.isFinite(z)) {
            return;
          }
          if (
            [
              'rectangle',
              'polygon',
              'zone-rectangle',
              'zone-polygon',
              'blocked-rectangle',
            ].includes(state.tool)
          ) {
            state.addPoint([x, z]);
            if (state.tool.includes('rectangle') && store.getState().drawing.length === 2) {
              store.getState().apply();
            }
          } else {
            state.place([x, z]);
          }
        }}
      >
        {state.tool.includes('rectangle') || state.tool.includes('polygon')
          ? 'Add drawing point'
          : 'Place at coordinates'}
      </Button>
      <p className="fp-muted">
        {state.drawing.length} drawing points · Shift+S applies · Escape cancels
      </p>
    </div>
  );
}
function Directions({
  store,
  setRoute,
}: {
  store: StudioStore;
  setRoute: (route: PlanRoute | null) => void;
}) {
  const state = store(),
    [start, setStart] = useState(''),
    [end, setEnd] = useState('');
  const navigator = useMemo(() => new StudioNavigator(), []);
  const request = useRef<AbortController | null>(null);
  const [routing, setRouting] = useState(false);
  useEffect(
    () => () => {
      request.current?.abort();
      navigator.dispose();
    },
    [navigator],
  );
  useEffect(() => {
    request.current?.abort();
    setRouting(false);
    setRoute(null);
  }, [state.revision, start, end, setRoute]);
  useEffect(() => {
    request.current?.abort();
    setRouting(false);
  }, [state.floorId]);
  const locations = state.document.floors.flatMap((floor) => [
    {
      value: `${floor.source.id}/spawn`,
      name: `${floor.source.name} · Avatar start`,
      location: { floorId: floor.source.id, point: floor.spawn } as RoutePoint,
    },
    ...floor.objects.map((object) => ({
      value: `${floor.source.id}/${object.id}`,
      name: `${floor.source.name} · ${object.name}`,
      location: {
        floorId: floor.source.id,
        point: object.collidable ? portalLanding(object) : object.position,
      } as RoutePoint,
    })),
  ]);
  return (
    <div className="fp-form">
      <Label>
        From
        <select
          aria-label="Route from"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        >
          <option value="">Choose start</option>
          {locations.map((location) => (
            <option key={location.value} value={location.value}>
              {location.name}
            </option>
          ))}
        </select>
      </Label>
      <Label>
        To
        <select aria-label="Route to" value={end} onChange={(event) => setEnd(event.target.value)}>
          <option value="">Choose destination</option>
          {locations.map((location) => (
            <option key={location.value} value={location.value}>
              {location.name}
            </option>
          ))}
        </select>
      </Label>
      <Button
        variant="outline"
        size="sm"
        disabled={!start || !end || start === end || routing || unfinished(state)}
        onClick={async () => {
          const from = locations.find((l) => l.value === start),
            to = locations.find((l) => l.value === end);
          if (!from || !to) {
            return;
          }
          request.current?.abort();
          const controller = new AbortController();
          request.current = controller;
          setRouting(true);
          try {
            const route = await navigator.plan(
              state.document,
              from.location,
              to.location,
              controller.signal,
            );
            if (controller.signal.aborted || store.getState().revision !== state.revision) {
              return;
            }
            setRoute(route);
            state.notify(
              `Walkable route: ${route.distance.toFixed(1)} m across ${route.segments.length} floor segment(s).`,
            );
          } catch (error) {
            if (controller.signal.aborted) {
              return;
            }
            setRoute(null);
            state.notify(error instanceof Error ? error.message : 'Route unavailable.');
          } finally {
            if (request.current === controller) {
              setRouting(false);
            }
          }
        }}
      >
        {routing ? 'Computing Recast route…' : 'Preview directions'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          request.current?.abort();
          setRouting(false);
          setRoute(null);
        }}
      >
        Clear route
      </Button>
    </div>
  );
}
export default function StudioPage() {
  const eventId =
    new URLSearchParams(window.location.search).get('eventId')?.trim() || 'floor-plan-studio';
  const store = useMemo(() => createStudioStore(eventId), [eventId]),
    state = store(),
    floor = activeFloor(state);
  const persistence = useMemo(() => new StudioPersistence(eventId, store), [eventId, store]);
  const [view, setView] = useState(initialView);
  useBoothTour(store, view, setView);
  useStudioDebug(store);
  const [loading, setLoading] = useState(true),
    [serverDraft, setServerDraft] = useState<BuildingLayout | null>(null),
    [localDraft, setLocalDraft] = useState<BuildingLayout | null>(null);
  const [published, setPublished] = useState<BuildingLayout | null>(null),
    [search, setSearch] = useState(''),
    [route, setRoute] = useState<PlanRoute | null>(null);
  const [authOpen, setAuthOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [deleteFloor, setDeleteFloor] = useState(false),
    [finalizeOpen, setFinalizeOpen] = useState(false),
    [reloadOpen, setReloadOpen] = useState(false);
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [authError, setAuthError] = useState(''),
    [signedIn, setSignedIn] = useState(!!venueSession()),
    [busy, setBusy] = useState(false);
  const fileImport = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    try {
      const cached = localStorage.getItem(localDraftKey(eventId));
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.eventId === eventId && parsed.layout) {
          if (decodeLayout(parsed.layout).baseline.buildingId !== eventId) {
            throw new Error('Recovery event mismatch.');
          }
          setLocalDraft(parsed.layout);
        }
      }
    } catch {
      store
        .getState()
        .notify(
          'A damaged local draft was found. Export the current document before replacing recovery data.',
        );
    }
    void persistence
      .load(controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setServerDraft(loaded.draft);
          setPublished(loaded.published);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          store.getState().notify(error instanceof Error ? error.message : 'Could not load event.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [eventId, persistence, store]);
  useEffect(() => {
    if (loading || state.revision === state.savedRevision) {
      return;
    }
    try {
      localStorage.setItem(
        localDraftKey(eventId),
        JSON.stringify({ eventId, layout: encodeLayout(state.document), updatedAt: Date.now() }),
      );
    } catch {
      store.getState().notify('Local recovery could not be written. Export JSON to keep a backup.');
    }
    if (state.saveState === 'Error') {
      return;
    }
    const timer = window.setTimeout(() => {
      void persistence.saveDraft();
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [eventId, loading, state.revision, state.savedRevision, state.document, persistence, store]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      const current = store.getState();
      if (unfinished(current) || current.revision !== current.savedRevision) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [store]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (view.preview) {
        return;
      }
      const command = resolveShortcut(event, isEditableTarget(event.target));
      if (!command) {
        return;
      }
      const current = store.getState();
      if (
        command === 'finish' &&
        (!current.drawing.length ||
          (event.target instanceof Element && event.target.closest('button,a,[role="button"]')))
      ) {
        return;
      }
      event.preventDefault();
      if (command === 'undo') {
        current.undo();
        return;
      } else if (command === 'redo') {
        current.redo();
        return;
      } else if (command === 'apply' || command === 'finish') {
        current.apply();
      } else if (command === 'cancel') {
        current.cancel();
      } else if (command === 'preset') {
        current.choosePreset();
      } else if (command === 'poi') {
        current.cyclePoi();
      } else {
        current.setTool(command);
      }
      const section =
        command === 'poi'
          ? 'POIs & connections'
          : command === 'zone-rectangle'
            ? 'Walkable zones'
            : command === 'preset' || command === 'rectangle' || command === 'polygon'
              ? 'Drawing & placement'
              : current.pendingFloor
                ? 'Floor & calibration'
                : 'Object properties';
      const panel = document.querySelector<HTMLDetailsElement>(
        `details[data-editor-section="${section}"]`,
      );
      if (panel) {
        panel.open = true;
        panel.scrollIntoView({ block: 'nearest' });
        panel.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [store, view.preview]);
  useEffect(() => {
    setRoute(null);
  }, [state.revision]);
  const restore = (layout: BuildingLayout) => {
    try {
      const restored = decodeLayout(layout);
      if (restored.baseline.buildingId !== eventId) {
        throw new Error(
          'The draft belongs to another event. Your current workspace was preserved.',
        );
      }
      store.getState().load(restored, true);
      setLocalDraft(null);
      setServerDraft(null);
    } catch (error) {
      store.getState().notify(error instanceof Error ? error.message : 'Draft invalid.');
    }
  };
  const exportDocument = () => {
    try {
      const blob = new Blob([JSON.stringify(encodeLayout(state.document), null, 2)], {
          type: 'application/json',
        }),
        url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `${eventId}-floor-plan.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      state.notify(error instanceof Error ? error.message : 'Export failed.');
    }
  };
  return (
    <main
      className={`fp-studio${view.preview ? ' fp-preview-mode' : ''}`}
      data-testid="floor-plan-studio"
      onPointerDownCapture={(event) => {
        if (
          view.touring &&
          !(event.target instanceof Element && event.target.closest('[data-tour-control]'))
        ) {
          setView((current) => ({ ...current, touring: false }));
        }
      }}
    >
      <header className="fp-header">
        <div className="fp-brand">
          <span className="fp-mark">
            <Layers size={22} />
          </span>
          <div>
            <h1>
              Floor plan studio <Badge variant="outline">ADMIN</Badge>
            </h1>
            <p>Author the space. Shape the experience.</p>
          </div>
        </div>
        <div className="fp-header-actions">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={view.preview}
            onClick={() => {
              if (unfinished(store.getState())) {
                state.notify('Apply or discard unfinished changes before changing view.');
                return;
              }
              state.setTool('select');
              setView((current) => ({ ...current, preview: !current.preview, touring: false }));
            }}
          >
            {view.preview ? 'Back to editing' : 'Preview venue'}
          </Button>
          <span className="fp-event">{eventId}</span>
          <Button variant="ghost" size="sm" onClick={() => setAuthOpen(true)}>
            <LogIn size={15} />
            {signedIn ? 'Administrator' : 'Sign in'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void persistence.saveDraft();
            }}
            disabled={loading || state.saveState === 'Saving'}
          >
            <Save size={15} />
            {state.saveState === 'Error' ? 'Retry save' : 'Save draft'}
          </Button>
          <Button size="sm" onClick={() => setFinalizeOpen(true)} disabled={loading || busy}>
            <Check size={15} />
            Finalize
          </Button>
          <a
            href={`${import.meta.env.BASE_URL}#/venue`}
            className="fp-exit"
            aria-label="Open existing venue management"
          >
            <ArrowUpRight size={18} />
          </a>
        </div>
      </header>
      {state.publicationIssues?.revision === state.revision && (
        <details className="fp-publication-issues fp-authoring-only" open>
          <summary>
            Publication needs attention · {state.publicationIssues.entries.length} issue(s)
          </summary>
          <ul>
            {state.publicationIssues.entries.map((issue, index) => (
              <li key={index}>
                {issue.floorId ? (
                  <button
                    disabled={unfinished(state)}
                    onClick={() => {
                      if (!issue.floorId || !state.setFloor(issue.floorId)) {
                        return;
                      }
                      if (issue.objectId) {
                        store.getState().select({ kind: 'object', id: issue.objectId });
                      }
                      const section = document.querySelector<HTMLDetailsElement>(
                        `details[data-editor-section="${issue.objectId ? 'Object properties' : 'Floor & calibration'}"]`,
                      );
                      if (section) {
                        section.open = true;
                        section.scrollIntoView({ block: 'nearest' });
                        section.focus();
                      }
                    }}
                  >
                    {issue.message}
                  </button>
                ) : (
                  issue.message
                )}
              </li>
            ))}
          </ul>
          <Button
            size="sm"
            variant="outline"
            onClick={() => store.setState({ publicationIssues: null })}
          >
            Dismiss issues
          </Button>
        </details>
      )}
      <div className="fp-workspace">
        <aside className="fp-library">
          <div className="fp-library-top">
            <span className="fp-eyebrow">YOUR VENUE</span>
            <h2>Build your floor plan</h2>
            <p>Everything you need to place, organize and connect.</p>
          </div>
          <Section title="Floors" icon={<Layers size={16} />}>
            <div className="fp-floor-list">
              {state.document.floors.map((item, index) => (
                <button
                  key={item.source.id}
                  className={state.floorId === item.source.id ? 'fp-floor active' : 'fp-floor'}
                  onClick={() => state.setFloor(item.source.id)}
                >
                  <span className="fp-floor-number">{String(index + 1).padStart(2, '0')}</span>
                  <span>
                    {item.source.name}
                    <small>{item.objects.length} objects</small>
                  </span>
                  <span className="fp-floor-dot" />
                </button>
              ))}
            </div>
            <div className="fp-row fp-authoring-only">
              <Button variant="outline" size="sm" onClick={state.addFloor}>
                <Plus size={14} />
                Add floor
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Delete current floor"
                disabled={state.document.floors.length < 2}
                onClick={() => setDeleteFloor(true)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
            <BoothDirectory store={store} />
          </Section>
          {!view.preview && (
            <Tabs defaultValue="inventory" className="fp-library-tabs">
              <TabsList className="w-full">
                <TabsTrigger value="inventory">
                  <Package size={14} />
                  Inventory
                </TabsTrigger>
                <TabsTrigger value="directory">
                  <Layers size={14} />
                  Directory
                </TabsTrigger>
              </TabsList>
              <TabsContent value="inventory">
                <div className="fp-search">
                  <Search size={15} />
                  <Input
                    aria-label="Search inventory"
                    placeholder="Search objects…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                {(['Booths', 'Connections', 'Structures', 'Amenities', 'Furniture'] as const).map(
                  (category) => (
                    <div key={category} className="fp-inventory-category">
                      <h3>{category}</h3>
                      <div className="fp-inventory-grid">
                        {inventory
                          .filter(
                            (item) =>
                              item.category === category &&
                              item.name.toLowerCase().includes(search.toLowerCase()),
                          )
                          .map((item) => (
                            <button
                              key={item.id}
                              draggable
                              className={
                                state.tool === 'place' && state.recipe === item.id
                                  ? 'fp-inventory-item active'
                                  : 'fp-inventory-item'
                              }
                              aria-label={`Place ${item.name}`}
                              onClick={() => state.setTool('place', item.id)}
                              onDragStart={(event) => {
                                if (unfinished(store.getState())) {
                                  event.preventDefault();
                                  state.notify(
                                    'Apply or discard unfinished changes before dragging an item.',
                                  );
                                  return;
                                }
                                state.setTool('place', item.id);
                                event.dataTransfer.setData(
                                  'application/x-floor-plan-recipe',
                                  item.id,
                                );
                                event.dataTransfer.effectAllowed = 'copy';
                              }}
                              onDragEnd={() => {
                                const current = store.getState();
                                current.setPointer(null);
                                if (current.tool === 'place' && !unfinished(current)) {
                                  current.setTool('select');
                                }
                              }}
                            >
                              <span
                                className={`fp-recipe-preview fp-preview-${item.id}`}
                                style={{ '--recipe-color': item.color } as React.CSSProperties}
                              >
                                {item.category === 'Connections' ? (
                                  <Layers size={30} />
                                ) : item.id === 'avatar' ? (
                                  <span className="fp-person-icon">
                                    ●<br />┃
                                  </span>
                                ) : item.id === 'barn-tent' ? (
                                  <Pentagon size={34} />
                                ) : (
                                  <Package size={32} />
                                )}
                              </span>
                              <strong>{item.name}</strong>
                              <small>
                                {item.dimensions[0]} × {item.dimensions[2]} m
                              </small>
                              <Badge
                                variant="outline"
                                aria-label={`${floor.objects.filter((object) => object.recipe === item.id && object.id !== state.pendingRemoval?.id).length} ${item.name} placed on this floor`}
                              >
                                {
                                  floor.objects.filter(
                                    (object) =>
                                      object.recipe === item.id &&
                                      object.id !== state.pendingRemoval?.id,
                                  ).length
                                }{' '}
                                placed
                              </Badge>
                            </button>
                          ))}
                      </div>
                    </div>
                  ),
                )}
                <p className="fp-muted fp-library-note">
                  Drag onto the floor, or choose an item and click to place. Detailed procedural
                  models will follow.
                </p>
              </TabsContent>
              <TabsContent value="directory">
                <div className="fp-directory">
                  {floor.objects
                    .filter((object) => object.id !== state.pendingRemoval?.id)
                    .map((object) => (
                      <button
                        key={object.id}
                        onClick={() => state.select({ kind: 'object', id: object.id })}
                        className={state.selection?.id === object.id ? 'active' : ''}
                      >
                        <span
                          className="fp-status-dot"
                          style={{
                            background: statusColors[object.status],
                          }}
                        />
                        <span>
                          <strong>
                            {object.boothNumber && object.recipe.includes('booth')
                              ? `${object.boothNumber} · `
                              : ''}
                            {object.name}
                          </strong>
                          <small>
                            {object.recipe} · {object.dimensions[0].toFixed(1)} ×{' '}
                            {object.dimensions[2].toFixed(1)} m
                          </small>
                        </span>
                      </button>
                    ))}
                  {floor.zones
                    .filter((zone) => zone.id !== state.pendingRemoval?.id)
                    .map((zone) => (
                      <button
                        key={zone.id}
                        className={state.selection?.id === zone.id ? 'active' : ''}
                        onClick={() => state.select({ kind: 'zone', id: zone.id })}
                      >
                        <Pentagon size={16} />
                        <span>
                          <strong>{zone.label}</strong>
                          <small>{zone.type} zone</small>
                        </span>
                      </button>
                    ))}
                  {!floor.objects.length && !floor.zones.length && (
                    <p className="fp-muted">
                      This floor is a blank canvas. Start with a booth or a walkable zone.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </aside>
        <section className="fp-scene-column">
          <div className="fp-toolbar fp-authoring-only">
            <div className="fp-tool-buttons">
              {tools.map((tool) => (
                <Button
                  key={tool.id}
                  size="sm"
                  variant={state.tool === tool.id ? 'secondary' : 'ghost'}
                  aria-label={tool.name}
                  aria-pressed={state.tool === tool.id}
                  title={`${tool.name}${tool.key ? ` · Shift+${tool.key}` : ''}`}
                  onClick={() => state.setTool(tool.id)}
                >
                  {tool.icon}
                  <span>{tool.name}</span>
                </Button>
              ))}
            </div>
            <div className="fp-tool-history">
              <Button size="icon" variant="ghost" aria-label="Undo" onClick={state.undo}>
                <Undo2 size={17} />
              </Button>
              <Button size="icon" variant="ghost" aria-label="Redo" onClick={state.redo}>
                <Redo2 size={17} />
              </Button>
              <Button
                size="icon"
                variant={state.tool === 'remove' ? 'secondary' : 'ghost'}
                aria-label="Arm removal"
                title="Remove · Shift+X"
                onClick={() => state.setTool('remove')}
              >
                <Trash2 size={17} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Keyboard shortcuts"
                onClick={() => setHelpOpen(true)}
              >
                <Keyboard size={17} />
              </Button>
            </div>
          </div>
          {(localDraft || serverDraft) && (
            <div className="fp-recovery" role="status">
              <span>
                {localDraft
                  ? 'A local recovery draft is available.'
                  : 'A server draft is available.'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => restore((localDraft ?? serverDraft)!)}
              >
                Restore draft
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={unfinished(state) || state.revision !== state.savedRevision}
                onClick={() => {
                  if (localDraft) {
                    localStorage.removeItem(localDraftKey(eventId));
                    setLocalDraft(null);
                  }
                  if (serverDraft) {
                    void persistence.saveDraft().then(() => {
                      if (store.getState().saveState === 'Saved') {
                        setServerDraft(null);
                      }
                    });
                  }
                }}
              >
                Discard recovery draft
              </Button>
            </div>
          )}
          {loading && (
            <div className="fp-loading" role="status">
              Loading event… You can start locally while the event loads.
            </div>
          )}
          {unfinished(state) && (
            <div className="fp-recovery" role="status">
              <span>
                {state.pendingRemoval
                  ? 'Removal preview — Apply to save, or Discard to restore.'
                  : 'Draft changes pending. Apply or discard before changing floor.'}
              </span>
              <Button size="sm" onClick={() => state.apply()}>
                Apply to save
              </Button>
              <Button size="sm" variant="outline" onClick={state.cancel}>
                Discard
              </Button>
            </div>
          )}
          <div className="fp-viewport-wrap">
            <CameraHud view={view} setView={setView} />
            <FloorCanvas
              store={store}
              route={route}
              view={view}
              onInteract={() =>
                setView((current) => (current.touring ? { ...current, touring: false } : current))
              }
            />
          </div>
          <footer className="fp-status-bar">
            <span className={`fp-save-status fp-save-${state.saveState.toLowerCase()}`}>
              <span />
              {state.saveState}
            </span>
            <p role="status" aria-live="polite">
              {state.message}
            </p>
            <span>
              {floor.objects.length} objects · {floor.zones.length} zones
            </span>
          </footer>
        </section>
        <aside className="fp-inspector">
          <div className="fp-inspector-heading">
            <Settings2 size={17} />
            <h2>{view.preview ? 'Venue preview' : 'Authoring panel'}</h2>
            <Badge variant="outline">{floor.source.name}</Badge>
          </div>
          <Section title="Booth details" icon={<Package size={15} />}>
            <BoothDetails store={store} />
          </Section>
          <Section title="View options" icon={<Settings2 size={15} />}>
            <ViewOptions view={view} setView={setView} />
          </Section>
          <Section title="Object properties" icon={<Settings2 size={15} />} authoring>
            <Inspector store={store} />
          </Section>
          <Section title="Groups & selection" icon={<Layers size={15} />} open={false} authoring>
            <GroupingPanel store={store} />
          </Section>
          <Section title="Drawing & placement" icon={<Pentagon size={15} />} open={false} authoring>
            <div className="fp-form">
              <Button
                size="sm"
                variant="outline"
                aria-pressed={view.resizeAspect}
                onClick={() =>
                  setView((current) => ({ ...current, resizeAspect: !current.resizeAspect }))
                }
              >
                Aspect lock {view.resizeAspect ? 'on' : 'off'} (or hold Shift)
              </Button>
              <Label>
                Resize snap (m)
                <Input
                  aria-label="Resize snap (m)"
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={view.resizeSnap}
                  onChange={(event) => {
                    const snap = Number(event.target.value);
                    if (Number.isFinite(snap) && snap >= 0 && snap <= 10) {
                      setView((current) => ({ ...current, resizeSnap: snap }));
                    }
                  }}
                />
              </Label>
            </div>
            <div className="fp-preset-palette" aria-label="Demo booth presets">
              {boothPresets.map((preset) => (
                <Button
                  key={preset.id}
                  size="sm"
                  variant={state.presetId === preset.id ? 'secondary' : 'outline'}
                  aria-pressed={state.presetId === preset.id}
                  onClick={() => state.choosePreset(preset.id)}
                >
                  {preset.label} · {preset.boothSize}
                </Button>
              ))}
            </div>
            <DrawingControls store={store} />
            <div className="fp-row">
              <Button size="sm" onClick={() => state.apply()}>
                Apply / finish
              </Button>
              <Button size="sm" variant="outline" onClick={state.cancel}>
                Discard / cancel
              </Button>
            </div>
          </Section>
          <Section title="Walkable zones" icon={<Square size={15} />} authoring>
            <div className="fp-form">
              <Button variant="outline" size="sm" onClick={() => state.setTool('zone-rectangle')}>
                Draw rectangular zone
              </Button>
              <Button variant="outline" size="sm" onClick={() => state.setTool('zone-polygon')}>
                Draw polygon zone
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => state.setTool('blocked-rectangle')}
              >
                Draw blocked zone
              </Button>
              <p className="fp-muted">
                Select zones in the directory to edit, move or duplicate them.
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={!state.drawing.length}
                onClick={state.removePoint}
              >
                Remove last point
              </Button>
            </div>
          </Section>
          <Section
            title="POIs & connections"
            icon={<Navigation size={15} />}
            open={false}
            authoring
          >
            <div className="fp-form">
              {(['stairs', 'entrance', 'elevator', 'escalator'] as RecipeId[]).map((recipe) => (
                <Button
                  key={recipe}
                  variant="outline"
                  size="sm"
                  onClick={() => state.setTool('place', recipe)}
                >
                  Place {recipe}
                </Button>
              ))}
              <p className="fp-muted">
                Select a connector, then use its properties to link another floor.
              </p>
            </div>
          </Section>
          <Section title="Directions" icon={<Navigation size={15} />} open={false}>
            <Directions store={store} setRoute={setRoute} />
            {route && (
              <ol className="fp-route-steps">
                {route.segments.map((segment, index) => (
                  <li key={index}>
                    <button onClick={() => state.setFloor(segment.floorId)}>
                      {index + 1}.{' '}
                      {
                        state.document.floors.find((f) => f.source.id === segment.floorId)?.source
                          .name
                      }
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Section>
          <Section title="Floor & calibration" icon={<Layers size={15} />} open={false} authoring>
            <FloorProperties key={floor.source.id} store={store} />
          </Section>
          <Section title="Finalize & export" icon={<Save size={15} />} open={false} authoring>
            <div className="fp-form">
              <Button variant="outline" size="sm" onClick={exportDocument}>
                Export layout JSON
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileImport.current?.click()}>
                Import layout JSON
              </Button>
              <Input
                ref={fileImport}
                type="file"
                aria-label="Import layout JSON"
                className="hidden"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) {
                    return;
                  }
                  const before = store.getState();
                  if (unfinished(before) || before.revision !== before.savedRevision) {
                    state.notify(
                      'Save and discard unfinished changes before importing another document.',
                    );
                    return;
                  }
                  void file
                    .text()
                    .then((text) => {
                      const input: unknown = JSON.parse(text);
                      const document = decodeLayout(input);
                      const latest = store.getState();
                      if (latest.revision !== before.revision || unfinished(latest)) {
                        throw new Error(
                          'The workspace changed while importing. Your current edits were preserved; import again when ready.',
                        );
                      }
                      if (document.baseline.buildingId !== eventId) {
                        throw new Error('The imported event ID must match the current event.');
                      }
                      store.getState().load(document, true);
                    })
                    .catch((error: unknown) =>
                      state.notify(error instanceof Error ? error.message : 'Import failed.'),
                    );
                }}
              />
              <Button variant="outline" size="sm" onClick={() => setReloadOpen(true)}>
                Reload / compare published
              </Button>
              <p className="fp-muted">
                Drafts are private. Finalize publishes after geometry, calibration and landing
                checks.
              </p>
            </div>
          </Section>
        </aside>
      </div>
      <Dialog open={deleteFloor} onOpenChange={setDeleteFloor}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {floor.source.name}?</DialogTitle>
            <DialogDescription>
              This removes this floor’s objects and connector landings. Other floors remain.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteFloor(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                state.deleteFloor(state.floorId);
                setDeleteFloor(false);
              }}
            >
              Delete floor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize this floor plan?</DialogTitle>
            <DialogDescription>
              The current document will be saved as a draft, checked and published for this event.
              Any failure preserves your edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizeOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void persistence.finalize().finally(() => {
                  setBusy(false);
                  setFinalizeOpen(false);
                });
              }}
            >
              Publish layout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={reloadOpen} onOpenChange={setReloadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reload published layout</DialogTitle>
            <DialogDescription>
              Export your JSON first to compare changes. Reload replaces applied local edits after
              you discard unfinished work.
              {published &&
                ` The last loaded published snapshot has ${published.floors.length} floor(s).`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={exportDocument}>
              Export current JSON
            </Button>
            <Button
              disabled={unfinished(state)}
              onClick={() => {
                setLoading(true);
                void persistence
                  .load(undefined, true)
                  .then((loaded) => {
                    setPublished(loaded.published);
                    setServerDraft(loaded.draft);
                  })
                  .catch((error: unknown) =>
                    store
                      .getState()
                      .notify(
                        error instanceof Error
                          ? error.message
                          : 'Could not reload the published event.',
                      ),
                  )
                  .finally(() => {
                    setReloadOpen(false);
                    setLoading(false);
                  });
              }}
            >
              Reload published
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Administrator sign in</DialogTitle>
            <DialogDescription>
              Use the existing venue account to save private drafts and finalize. Your password is
              never saved locally.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setAuthError('');
              void venueLogin(username, password)
                .then(() => {
                  setSignedIn(true);
                  setPassword('');
                  setAuthOpen(false);
                  void persistence
                    .load()
                    .then((loaded) => {
                      setServerDraft(loaded.draft);
                      setPublished(loaded.published);
                    })
                    .catch((error: unknown) =>
                      store
                        .getState()
                        .notify(
                          error instanceof Error
                            ? error.message
                            : 'Could not load the event after sign in.',
                        ),
                    );
                })
                .catch((error: unknown) =>
                  setAuthError(error instanceof Error ? error.message : 'Sign in failed.'),
                )
                .finally(() => setBusy(false));
            }}
            className="fp-form"
          >
            <Label>
              Username
              <Input
                aria-label="Username"
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </Label>
            <Label>
              Password
              <Input
                aria-label="Password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Label>
            {authError && (
              <p role="alert" className="fp-error">
                {authError}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              Sign in
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Authoring shortcuts</DialogTitle>
            <DialogDescription>
              These match the reference demo. Shortcuts stay inactive while you type in a form.
            </DialogDescription>
          </DialogHeader>
          <div className="fp-shortcuts">
            {[
              ['Shift+S', 'Apply dirty editor / drawing'],
              ['Shift+R', 'Resize booth'],
              ['Shift+M', 'Move booth or POI'],
              ['Shift+D', 'Duplicate placement'],
              ['Shift+B / P', 'Rectangle / polygon booth'],
              ['Shift+T', 'Cycle booth preset'],
              ['Shift+I', 'Cycle stairs / entrance'],
              ['Shift+Z', 'Rectangle walkable zone'],
              ['Shift+X', 'Arm removal'],
              ['Ctrl/Cmd+Z', 'Undo active floor'],
              ['Ctrl/Cmd+Shift+Z', 'Redo active floor'],
              ['Enter / double-click / right-click', 'Finish polygon'],
              ['Escape', 'Cancel unfinished action'],
            ].map(([keys, description]) => (
              <div key={keys}>
                <kbd>{keys}</kbd>
                <span>{description}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
