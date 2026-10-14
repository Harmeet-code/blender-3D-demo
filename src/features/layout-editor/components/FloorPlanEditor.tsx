import { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import type { Node as KonvaNode } from 'konva/lib/Node';
import type { Transformer as TransformerNode } from 'konva/lib/shapes/Transformer';
import {
  Stage,
  Layer,
  Group,
  Transformer as KonvaTransformer,
  Line as KonvaLine,
  Circle,
  Text as KonvaText,
} from 'react-konva';
import { AuthoringTools, type PlacementChoice } from './AuthoringTools.tsx';
import { FloorFeaturesEditor, type FeatureSelection } from './FloorFeaturesEditor.tsx';
import { PortalEditor } from './PortalEditor.tsx';
import { VenueKitStarter } from './VenueKitStarter.tsx';
import { blankFloor } from '../model/floor-drafts.ts';
import { INVENTORY_DRAG_TYPE, type InventoryDrag } from '../model/inventory-drag.ts';
import { uploadMedia, mediaUrl } from '../api/media-client.ts';
import { boothRectangle, METRES_PER_FOOT } from '@/features/building/model/booth-dimensions.ts';
import type { FloorAuthoring } from '@/features/building/model/building-schema.ts';
import {
  sourceToMetres,
  metresToSource,
  calibrateRectangle,
} from '@/features/building/model/floor-coordinates.ts';
import { polygonBounds } from '@/utils/geometry/polygon.ts';
import { boothModelFor } from '@/features/assets/model/booth-models.ts';
import { replaceFloorImage } from '@/features/building/model/replace-floor-image.ts';
import chairMetadata from '@/assets/metadata/chair.v1.json';
import { DownloadIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLayoutStore } from '@/features/building/model/layout-store.ts';
import { normalizeLayout } from '@/features/building/model/normalize-layout.ts';
import { portalPlacements } from '@/features/building/model/portal-placement.ts';
import { stressSource } from '@/features/building/model/asset-stress-layout.ts';
import type { BuildingLayout } from '@/features/building/model/building-schema.ts';
import { reexpressFloor } from '@/features/building/model/reexpress-floor.ts';
export function FloorPlanEditor() {
  const source = useLayoutStore((s) => s.source),
    update = useLayoutStore((s) => s.commit);
  const undoCount = useLayoutStore((s) => s.undoCount),
    redoCount = useLayoutStore((s) => s.redoCount);
  const gesture = useRef<{ node: KonvaNode; cancelled: boolean } | null>(null);
  const imageUpload = useRef(0);
  const transformNodes = useRef(new Map<string, KonvaNode>());
  const transformer = useRef<TransformerNode | null>(null);
  const inventoryDrag = useRef<InventoryDrag | null>(null);
  const [dropGhost, setDropGhost] = useState<{
    payload: InventoryDrag;
    position: [number, number];
  } | null>(null);
  useEffect(
    () => () => {
      imageUpload.current++;
    },
    [],
  );
  const cancelGesture = () => {
    const active = gesture.current;
    if (active) {
      active.cancelled = true;
      transformer.current?.stopTransform();
      active.node.stopDrag();
      active.node.position({ x: 0, y: 0 });
      active.node.scale({ x: 1, y: 1 });
      active.node.rotation(0);
      active.node.getLayer()?.batchDraw();
    }
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        inventoryDrag.current = null;
        setDropGhost(null);
        cancelGesture();
        setPoints([]);
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'z' &&
        !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        cancelGesture();
        if (event.shiftKey) {
          useLayoutStore.getState().redo();
        } else {
          useLayoutStore.getState().undo();
        }
      }
    };
    window.addEventListener('keydown', key);
    window.addEventListener('blur', cancelGesture);
    return () => {
      cancelGesture();
      window.removeEventListener('keydown', key);
      window.removeEventListener('blur', cancelGesture);
    };
  }, []);
  const [draft, setDraft] = useState(JSON.stringify(source, null, 2)),
    [floorId, setFloorId] = useState(source.floors[0]?.id ?? '');
  const [message, setMessage] = useState(''),
    [tool, setTool] = useState('inspect'),
    [roomId, setRoomId] = useState(source.rooms[0]?.id ?? '');
  const [portalId, setPortalId] = useState(source.portals[0]?.id ?? ''),
    [points, setPoints] = useState<Array<[number, number]>>([]);
  const [yaw, setYaw] = useState('0'),
    [newRoomId, setNewRoomId] = useState('booth-new');
  const [zoom, setZoom] = useState(1);
  const [feet, setFeet] = useState<[number, number]>([10, 10]);
  const [choice, setChoice] = useState<PlacementChoice>({
    assetId: 'chair',
    dimensions: chairMetadata.dimensions as [number, number, number],
  });
  const [calibrationFeet, setCalibrationFeet] = useState(30);
  const [selectedInstance, setSelectedInstance] = useState('');
  const [featureSelection, setFeatureSelection] = useState<FeatureSelection>(null);
  useEffect(() => {
    cancelGesture();
    inventoryDrag.current = null;
    setDropGhost(null);
    setPoints([]);
    setDraft(JSON.stringify(source, null, 2));
  }, [source]);
  const deferredDraft = useDeferredValue(draft);
  const parsed = useMemo(() => {
    try {
      return normalizeLayout(JSON.parse(deferredDraft));
    } catch {
      return null;
    }
  }, [deferredDraft]);
  const diagnostics = parsed?.isOk() ? portalPlacements(parsed.value).warnings : [];
  const floor = source.floors.find((f) => f.id === floorId) ?? source.floors[0];
  useEffect(() => {
    if (!source.floors.some((item) => item.id === floorId)) {
      setFloorId(source.floors[0]?.id ?? '');
    }
    const available = source.rooms.filter((item) => item.floorId === floorId);
    if (!available.some((item) => item.id === roomId)) {
      setRoomId(available[0]?.id ?? '');
    }
    if (!source.portals.some((item) => item.id === portalId)) {
      setPortalId(source.portals[0]?.id ?? '');
    }
  }, [source, floorId, roomId, portalId]);
  const pixelCoordinates =
    floor?.coordinateSystem?.units === 'pixels' ? floor.coordinateSystem : undefined;
  const pixel = !!pixelCoordinates;
  const calibrationRequired = floor?.calibrationStatus === 'required';
  const [heightDraft, setHeightDraft] = useState(String(floor?.heightOffset ?? 0));
  const [scaleDraft, setScaleDraft] = useState(
    String(
      floor?.coordinateSystem?.units === 'pixels' ? floor.coordinateSystem.metersPerPixel : 0.01,
    ),
  );
  const [originDraft, setOriginDraft] = useState<[string, string]>([
    String(floor?.coordinateSystem?.units === 'pixels' ? floor.coordinateSystem.origin[0] : 0),
    String(floor?.coordinateSystem?.units === 'pixels' ? floor.coordinateSystem.origin[1] : 0),
  ]);
  useEffect(() => {
    setHeightDraft(String(floor?.heightOffset ?? 0));
    if (floor?.coordinateSystem?.units === 'pixels') {
      setScaleDraft(String(floor.coordinateSystem.metersPerPixel));
      setOriginDraft([
        String(floor.coordinateSystem.origin[0]),
        String(floor.coordinateSystem.origin[1]),
      ]);
    } else {
      setScaleDraft('0.01');
      setOriginDraft(['0', '0']);
    }
  }, [floorId, floor?.heightOffset, floor?.coordinateSystem]);
  const [imageSize, setImageSize] = useState<[number, number] | null>(null);
  useEffect(() => {
    imageUpload.current++;
    cancelGesture();
    setPoints([]);
    setImageSize(floor?.image ? (floor.authoring?.imageSize ?? null) : null);
    if (!floor?.image) {
      return;
    }
    const image = new Image();
    image.onload = () =>
      setImageSize(floor.authoring?.imageSize ?? [image.naturalWidth, image.naturalHeight]);
    image.src = mediaUrl(floor.image);
    return () => {
      image.onload = null;
    };
  }, [floor?.image, floor?.authoring?.imageSize?.[0], floor?.authoring?.imageSize?.[1]]);
  const baseScale = pixel ? (imageSize ? Math.min(600 / imageSize[0], 360 / imageSize[1]) : 1) : 12,
    coordinateScale = baseScale * zoom,
    width = 600 * zoom,
    height = 360 * zoom;
  const viewOrigin: [number, number] = pixel ? [0, 0] : [-25, -15];
  const commit = (next: BuildingLayout) => {
    const result = update(next);
    setMessage(
      result.isOk()
        ? 'Layout applied. Coordinates are normalized once for the viewer.'
        : result.error.message,
    );
    if (result.isOk()) {
      setPoints([]);
    }
    return result.isOk();
  };
  const patchFloor = (patch: Partial<BuildingLayout['floors'][number]>) => {
    if (patch.coordinateSystem && floor?.authoring?.shellUrl) {
      patch.authoring = { ...floor.authoring, shellUrl: undefined };
    }
    const calibration = patch.coordinateSystem;
    commit({
      ...source,
      schemaVersion:
        source.schemaVersion ??
        (patch.authoring &&
        ['walls', 'zones', 'pois'].some((key) => Object.hasOwn(patch.authoring!, key))
          ? 2
          : undefined),
      floors: source.floors.map((f) => (f.id === floorId ? { ...f, ...patch } : f)),
      rooms: calibration
        ? source.rooms.map((room) => {
            if (room.floorId !== floorId || !room.dimensionsFeet) {
              return room;
            }
            const points = room.polygon.map((p) => sourceToMetres(p, calibration));
            const center: [number, number] = [
              points.reduce((n, p) => n + p[0], 0) / points.length,
              points.reduce((n, p) => n + p[1], 0) / points.length,
            ];
            const a = points[0]!,
              b = points[1]!,
              yaw = -Math.atan2(b[1] - a[1], b[0] - a[0]);
            const polygon = boothRectangle(center, room.dimensionsFeet, yaw).map((p) =>
              metresToSource(p, calibration),
            );
            return {
              ...room,
              polygon,
              entrance: room.entrance
                ? {
                    ...room.entrance,
                    position: [
                      (polygon[2]![0] + polygon[3]![0]) / 2,
                      (polygon[2]![1] + polygon[3]![1]) / 2,
                    ] as [number, number],
                    yawRadians: yaw,
                  }
                : undefined,
            };
          })
        : source.rooms,
    });
  };
  const authoring = (): FloorAuthoring =>
    floor?.authoring ?? {
      boundary:
        pixel && imageSize
          ? [[0, 0], [imageSize[0], 0], imageSize, [0, imageSize[1]]]
          : [
              [-20, -15],
              [20, -15],
              [20, 15],
              [-20, 15],
            ],
      obstacles: [],
      spawn: pixel ? [pixelCoordinates?.origin[0] ?? 0, pixelCoordinates?.origin[1] ?? 0] : [0, 6],
      instances: [],
      underlayOpacity: 0.85,
      imageSize: imageSize ?? undefined,
    };
  const patchAuthoring = (patch: Partial<FloorAuthoring>) =>
    patchFloor({ authoring: { ...authoring(), ...patch } });
  const moveFeature = (
    kind: 'wall' | 'zone' | 'poi',
    id: string,
    node: KonvaNode,
    free: boolean,
  ) => {
    if (gesture.current?.cancelled) {
      gesture.current = null;
      return;
    }
    gesture.current = null;
    const data = authoring();
    const anchor =
      kind === 'wall'
        ? data.walls?.find((item) => item.id === id)?.start
        : kind === 'zone'
          ? data.zones?.find((item) => item.id === id)?.polygon[0]
          : data.pois?.find((item) => item.id === id)?.position;
    if (!anchor) {
      return;
    }
    const moved = sourceToMetres(
      [anchor[0] + node.x() / coordinateScale, anchor[1] + node.y() / coordinateScale],
      floor?.coordinateSystem,
    );
    const snapped = metresToSource(
      free ? moved : [Math.round(moved[0] * 10) / 10, Math.round(moved[1] * 10) / 10],
      floor?.coordinateSystem,
    );
    const dx = snapped[0] - anchor[0],
      dy = snapped[1] - anchor[1];
    const shift = ([x, y]: [number, number]): [number, number] => [x + dx, y + dy];
    node.position({ x: 0, y: 0 });
    if (kind === 'wall') {
      patchAuthoring({
        walls: data.walls?.map((item) =>
          item.id === id ? { ...item, start: shift(item.start), end: shift(item.end) } : item,
        ),
      });
    }
    if (kind === 'zone') {
      patchAuthoring({
        zones: data.zones?.map((item) =>
          item.id === id ? { ...item, polygon: item.polygon.map(shift) } : item,
        ),
      });
    }
    if (kind === 'poi') {
      patchAuthoring({
        pois: data.pois?.map((item) =>
          item.id === id ? { ...item, position: shift(item.position) } : item,
        ),
      });
    }
  };
  const snapPosition = (position: [number, number], free = false): [number, number] => {
    const metric = sourceToMetres(position, floor?.coordinateSystem);
    return metresToSource(
      free ? metric : [Math.round(metric[0] * 10) / 10, Math.round(metric[1] * 10) / 10],
      floor?.coordinateSystem,
    );
  };
  const placeInventory = (payload: InventoryDrag, position: [number, number], free = false) => {
    if (calibrationRequired) {
      setMessage('Calibrate or confirm the physical scale before placing inventory.');
      return;
    }
    position = snapPosition(position, free);
    const yawRadians = (Number(yaw) * Math.PI) / 180;
    if (!Number.isFinite(yawRadians)) {
      setMessage('Facing must be a finite angle.');
      return;
    }
    if (payload.kind === 'booth') {
      const id = newRoomId === 'booth-new' ? `booth-${crypto.randomUUID()}` : newRoomId;
      const rectangle = boothRectangle(
        sourceToMetres(position, floor?.coordinateSystem),
        payload.feet,
        yawRadians,
      ).map((point) => metresToSource(point, floor?.coordinateSystem));
      if (
        commit({
          ...source,
          rooms: [
            ...source.rooms,
            {
              id,
              floorId,
              type: 'booth',
              dimensionsFeet: payload.feet,
              polygon: rectangle,
              boothModelUrl: boothModelFor(payload.feet)?.url,
              entrance: {
                position: [
                  (rectangle[2]![0] + rectangle[3]![0]) / 2,
                  (rectangle[2]![1] + rectangle[3]![1]) / 2,
                ],
                yawRadians,
              },
            },
          ],
        })
      ) {
        setRoomId(id);
        setSelectedInstance('');
      }
    } else {
      const id = `asset-${crypto.randomUUID()}`;
      patchAuthoring({
        instances: [
          ...authoring().instances,
          { ...payload.choice, id, position, yawRadians, scale: [1, 1, 1], collidable: true },
        ],
      });
      setSelectedInstance(id);
    }
    setDropGhost(null);
  };
  const ghostPolygon = dropGhost
    ? boothRectangle(
        sourceToMetres(dropGhost.position, floor?.coordinateSystem),
        dropGhost.payload.kind === 'booth'
          ? dropGhost.payload.feet
          : [
              dropGhost.payload.choice.dimensions[0] / METRES_PER_FOOT,
              dropGhost.payload.choice.dimensions[2] / METRES_PER_FOOT,
            ],
        (Number(yaw) * Math.PI) / 180,
      ).map((point) => metresToSource(point, floor?.coordinateSystem))
    : [];
  const selectedRoom = source.rooms.find((room) => room.id === roomId && room.floorId === floorId);
  const selectedPlacement = floor?.authoring?.instances.find(
    (item) => item.id === selectedInstance,
  );
  useEffect(() => {
    const node = selectedInstance
      ? transformNodes.current.get(`asset:${selectedInstance}`)
      : selectedRoom?.dimensionsFeet
        ? transformNodes.current.get(`booth:${selectedRoom.id}`)
        : undefined;
    transformer.current?.nodes(tool === 'inspect' && !calibrationRequired && node ? [node] : []);
    transformer.current?.getLayer()?.batchDraw();
  }, [source, roomId, selectedInstance, tool, calibrationRequired, selectedRoom]);
  const finishInventoryTransform = (
    kind: 'booth' | 'asset',
    id: string,
    node: KonvaNode,
    free: boolean,
  ) => {
    if (gesture.current?.cancelled) {
      gesture.current = null;
      return;
    }
    gesture.current = null;
    const room = kind === 'booth' ? source.rooms.find((item) => item.id === id) : undefined;
    const asset =
      kind === 'asset' ? authoring().instances.find((item) => item.id === id) : undefined;
    const footprint =
      room?.polygon ??
      (asset
        ? boothRectangle(
            sourceToMetres(asset.position, floor?.coordinateSystem),
            [
              (asset.dimensions[0] * asset.scale[0]) / METRES_PER_FOOT,
              (asset.dimensions[2] * asset.scale[2]) / METRES_PER_FOOT,
            ],
            asset.yawRadians,
          ).map((point) => metresToSource(point, floor?.coordinateSystem))
        : []);
    if (footprint.length !== 4) {
      return;
    }
    const transform = node.getTransform();
    const polygon = footprint.map(([x, y]) => {
      const point = transform.point({
        x: (x - viewOrigin[0]) * coordinateScale,
        y: (y - viewOrigin[1]) * coordinateScale,
      });
      return sourceToMetres(
        [point.x / coordinateScale + viewOrigin[0], point.y / coordinateScale + viewOrigin[1]],
        floor?.coordinateSystem,
      );
    });
    const original = footprint.map((point) => sourceToMetres(point, floor?.coordinateSystem));
    const rotatedOnly = Math.abs(node.scaleX() - 1) < 1e-6 && Math.abs(node.scaleY() - 1) < 1e-6;
    const width = rotatedOnly
      ? Math.hypot(original[1]![0] - original[0]![0], original[1]![1] - original[0]![1])
      : Math.hypot(polygon[1]![0] - polygon[0]![0], polygon[1]![1] - polygon[0]![1]);
    let angle = -Math.atan2(polygon[1]![1] - polygon[0]![1], polygon[1]![0] - polygon[0]![0]);
    const depth = rotatedOnly
      ? Math.hypot(original[2]![0] - original[1]![0], original[2]![1] - original[1]![1])
      : Math.abs(
          (polygon[2]![0] - polygon[1]![0]) * Math.sin(angle) +
            (polygon[2]![1] - polygon[1]![1]) * Math.cos(angle),
        );
    const center: [number, number] = [
      polygon.reduce((sum, p) => sum + p[0] / 4, 0),
      polygon.reduce((sum, p) => sum + p[1] / 4, 0),
    ];
    if (!free) {
      center[0] = Math.round(center[0] * 10) / 10;
      center[1] = Math.round(center[1] * 10) / 10;
      angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
    }
    node.position({ x: 0, y: 0 });
    node.scale({ x: 1, y: 1 });
    node.rotation(0);
    if (!Number.isFinite(width + depth + angle) || width < 0.1 || depth < 0.1) {
      setMessage('The footprint must be at least 0.1 m in each direction.');
      return;
    }
    if (room) {
      const dims: [number, number] =
        rotatedOnly && room.dimensionsFeet
          ? room.dimensionsFeet
          : [width / METRES_PER_FOOT, depth / METRES_PER_FOOT];
      const rectangle = boothRectangle(center, dims, angle).map((point) =>
        metresToSource(point, floor?.coordinateSystem),
      );
      commit({
        ...source,
        rooms: source.rooms.map((item) =>
          item.id === id
            ? {
                ...item,
                polygon: rectangle,
                dimensionsFeet: dims,
                boothModelUrl: boothModelFor(dims)?.url,
                entrance: {
                  position: [
                    (rectangle[2]![0] + rectangle[3]![0]) / 2,
                    (rectangle[2]![1] + rectangle[3]![1]) / 2,
                  ],
                  yawRadians: angle,
                },
              }
            : item,
        ),
      });
      setFeet(dims);
    }
    if (asset) {
      patchAuthoring({
        instances: authoring().instances.map((item) =>
          item.id === id
            ? {
                ...item,
                position: metresToSource(center, floor?.coordinateSystem),
                yawRadians: angle,
                scale: [width / item.dimensions[0], item.scale[1], depth / item.dimensions[2]],
              }
            : item,
        ),
      });
    }
  };
  const changeCoordinates = (
    next: BuildingLayout['floors'][number]['coordinateSystem'],
    image?: string,
  ) => {
    const converted = reexpressFloor(useLayoutStore.getState().source, floorId, next, image);
    if (converted.isErr()) {
      setMessage(converted.error.message);
      return;
    }
    commit(converted.value);
  };
  const download = () => {
    try {
      const value: unknown = JSON.parse(draft),
        valid = normalizeLayout(value);
      if (valid.isErr()) {
        setMessage(valid.error.message);
        return;
      }
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'venue-layout.json';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage('Layout JSON exported.');
    } catch {
      setMessage('Layout JSON is invalid. The last valid layout is still active.');
    }
  };
  return (
    <Card className="mx-auto max-w-5xl">
      <CardHeader>
        <CardTitle>Floor-plan editor</CardTitle>
        <CardDescription>
          Calibrate the image, draw booth boundaries, and place entrances and service areas.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!undoCount}
            onClick={() => {
              cancelGesture();
              useLayoutStore.getState().undo();
            }}
          >
            Undo
          </Button>
          <Button
            variant="outline"
            disabled={!redoCount}
            onClick={() => {
              cancelGesture();
              useLayoutStore.getState().redo();
            }}
          >
            Redo
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const result = useLayoutStore.getState().recoverDraft();
              setMessage(result.isOk() ? 'Local draft recovered.' : result.error.message);
            }}
          >
            Recover local draft
          </Button>
          <span className="self-center text-xs text-muted-foreground">
            Accepted edits save locally. Escape cancels a drag.
          </span>
        </div>
        <div className="sticky top-0 z-10 grid gap-3 rounded-xl border bg-card/95 p-3 shadow-sm backdrop-blur-md sm:grid-cols-3">
          <Label>
            Floor
            <Select
              value={floorId}
              onValueChange={(value) => {
                cancelGesture();
                imageUpload.current++;
                setFloorId(value);
                setFeatureSelection(null);
                setSelectedInstance('');
                setPoints([]);
                setZoom(1);
              }}
            >
              <SelectTrigger className="mt-2 w-full" aria-label="Editor floor">
                <SelectValue placeholder="Choose a floor" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Floors</SelectLabel>
                  {source.floors.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name} ({f.id})
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Label>
          <Label>
            Coordinates
            <Select
              value={pixel ? 'pixels' : 'meters'}
              onValueChange={(value) =>
                changeCoordinates(
                  value === 'pixels'
                    ? { units: 'pixels', metersPerPixel: 0.01, origin: [0, 0] }
                    : { units: 'meters' },
                )
              }
            >
              <SelectTrigger className="mt-2 w-full" aria-label="Coordinate units">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Coordinate system</SelectLabel>
                  <SelectItem value="meters">Meters</SelectItem>
                  <SelectItem value="pixels">Image pixels</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Label>
          <Label>
            Floor height (m)
            <Input
              aria-label="Floor height"
              type="number"
              step=".1"
              value={heightDraft}
              onChange={(e) => setHeightDraft(e.target.value)}
              onBlur={() => {
                if (heightDraft.trim() === '' || !Number.isFinite(Number(heightDraft))) {
                  setHeightDraft(String(floor?.heightOffset ?? 0));
                  return;
                }
                patchFloor({ heightOffset: Number(heightDraft) });
              }}
            />
          </Label>
        </div>
        {pixelCoordinates && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Label>
              Meters per pixel
              <Input
                aria-label="Meters per pixel"
                type="number"
                step=".001"
                value={scaleDraft}
                onChange={(e) => setScaleDraft(e.target.value)}
                onBlur={() => {
                  if (!pixelCoordinates) {
                    return;
                  }
                  const scale = Number(scaleDraft);
                  if (!Number.isFinite(scale) || scale <= 0 || scaleDraft.trim() === '') {
                    setScaleDraft(String(pixelCoordinates.metersPerPixel));
                    return;
                  }
                  patchFloor({
                    calibrationStatus: 'required',
                    coordinateSystem: {
                      units: 'pixels',
                      origin: pixelCoordinates.origin,
                      metersPerPixel: scale,
                    },
                  });
                }}
              />
            </Label>
            {([0, 1] as const).map((axis) => (
              <Label key={axis}>
                Image origin {axis === 0 ? 'X' : 'Y'}
                <Input
                  type="number"
                  aria-label={`Image origin ${axis === 0 ? 'X' : 'Y'}`}
                  value={originDraft[axis]}
                  onChange={(e) => {
                    const next: [string, string] = [...originDraft];
                    next[axis] = e.target.value;
                    setOriginDraft(next);
                  }}
                  onBlur={() => {
                    if (!pixelCoordinates) {
                      return;
                    }
                    const value = originDraft[axis];
                    if (value.trim() === '' || !Number.isFinite(Number(value))) {
                      setOriginDraft([
                        String(pixelCoordinates.origin[0]),
                        String(pixelCoordinates.origin[1]),
                      ]);
                      return;
                    }
                    const origin: [number, number] = [...pixelCoordinates.origin];
                    origin[axis] = Number(value);
                    patchFloor({
                      coordinateSystem: { ...pixelCoordinates, origin },
                    });
                  }}
                />
              </Label>
            ))}
          </div>
        )}
        <Label>
          Floor image (PNG/JPEG/WebP, up to 50 MiB)
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Floor image"
            onChange={async (e) => {
              const input = e.currentTarget;
              const generation = ++imageUpload.current;
              const { buildingId } = source;
              const file = e.target.files?.[0];
              if (!file) {
                return;
              }
              if (
                !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
                file.size > 50 * 1024 * 1024
              ) {
                setMessage('Choose a PNG, JPEG, or WebP under 50 MiB.');
                return;
              }
              try {
                setMessage('Uploading original and generating preview…');
                const uploaded = await uploadMedia(file);
                const latest = useLayoutStore.getState().source;
                if (
                  generation !== imageUpload.current ||
                  latest.buildingId !== buildingId ||
                  !latest.floors.some((f) => f.id === floorId)
                ) {
                  return;
                }
                if (!uploaded.width || !uploaded.height) {
                  throw new Error('Image dimensions missing.');
                }
                const converted = replaceFloorImage(latest, floorId, {
                  url: uploaded.url,
                  originalUrl: uploaded.originalUrl ?? uploaded.url,
                  tiles: uploaded.tiles,
                  width: uploaded.width,
                  height: uploaded.height,
                });
                if (converted.isErr()) {
                  throw new Error(converted.error.message);
                }
                commit(converted.value);
                setMessage(
                  `Stored ${uploaded.originalWidth} × ${uploaded.originalHeight} original; ${uploaded.width} × ${uploaded.height} preview. Calibrate a known booth edge before placing assets.`,
                );
              } catch (error) {
                if (generation === imageUpload.current) {
                  setMessage(error instanceof Error ? error.message : 'Image upload failed.');
                }
              }
              input.value = '';
            }}
          />
        </Label>
        <AuthoringTools
          tool={tool}
          setTool={(value) => {
            setTool(value);
            setPoints([]);
          }}
          feet={feet}
          setFeet={setFeet}
          choice={choice}
          setChoice={setChoice}
          calibrationFeet={calibrationFeet}
          setCalibrationFeet={setCalibrationFeet}
          onMessage={setMessage}
          onInventoryDrag={(payload) => {
            inventoryDrag.current = payload;
            setDropGhost(null);
          }}
          calibrationRequired={calibrationRequired}
        />
        {calibrationRequired && (
          <Alert>
            <AlertTitle>Calibrate this image before placing objects</AlertTitle>
            <AlertDescription>
              Measure a known edge or rectangle. If you entered a verified metres-per-pixel scale
              manually, explicitly confirm it below.
            </AlertDescription>
            <Button
              variant="outline"
              onClick={() => patchFloor({ calibrationStatus: 'confirmed' })}
            >
              Confirm current physical scale
            </Button>
          </Alert>
        )}
        {floor && (
          <FloorFeaturesEditor
            floor={floor}
            selection={featureSelection}
            setSelection={setFeatureSelection}
            patch={patchAuthoring}
            disabled={calibrationRequired}
            onMessage={setMessage}
          />
        )}
        <div className="flex flex-wrap items-end gap-3">
          <Label>
            Booth ID / label
            <Input
              aria-label="Placement booth ID"
              value={newRoomId}
              onChange={(e) => setNewRoomId(e.target.value)}
            />
          </Label>
          <Button
            variant="outline"
            disabled={!selectedRoom || calibrationRequired}
            onClick={() => {
              if (!selectedRoom) {
                return;
              }
              const polygon = selectedRoom.polygon.map((p) =>
                sourceToMetres(p, floor?.coordinateSystem),
              );
              const bounds = polygonBounds(polygon),
                center: [number, number] = [
                  (bounds.minX + bounds.maxX) / 2,
                  (bounds.minZ + bounds.maxZ) / 2,
                ];
              const a = polygon[0]!,
                b = polygon[1]!,
                angle = -Math.atan2(b[1] - a[1], b[0] - a[0]);
              const resized = boothRectangle(center, feet, angle).map((p) =>
                metresToSource(p, floor?.coordinateSystem),
              );
              const left = resized[2]!,
                right = resized[3]!;
              commit({
                ...source,
                rooms: source.rooms.map((room) =>
                  room.id === roomId
                    ? {
                        ...room,
                        polygon: resized,
                        dimensionsFeet: feet,
                        boothModelUrl: boothModelFor(feet)?.url,
                        entrance: {
                          position: [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2],
                          yawRadians: angle,
                        },
                      }
                    : room,
                ),
              });
            }}
          >
            Apply dimensions to selected booth
          </Button>
          <Button
            variant="outline"
            disabled={!selectedRoom || calibrationRequired}
            onClick={() => {
              if (!selectedRoom) {
                return;
              }
              const polygon = selectedRoom.polygon.map((p) =>
                sourceToMetres(p, floor?.coordinateSystem),
              );
              const b = polygonBounds(polygon);
              const center: [number, number] = [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2],
                angle = (Number(yaw) * Math.PI) / 180;
              const dims =
                selectedRoom.dimensionsFeet ??
                ([
                  Math.hypot(polygon[1]![0] - polygon[0]![0], polygon[1]![1] - polygon[0]![1]) /
                    METRES_PER_FOOT,
                  Math.hypot(polygon[2]![0] - polygon[1]![0], polygon[2]![1] - polygon[1]![1]) /
                    METRES_PER_FOOT,
                ] as [number, number]);
              const rotated = boothRectangle(center, dims, angle).map((p) =>
                metresToSource(p, floor?.coordinateSystem),
              );
              commit({
                ...source,
                rooms: source.rooms.map((r) =>
                  r.id === roomId
                    ? {
                        ...r,
                        polygon: rotated,
                        entrance: {
                          position: [
                            (rotated[2]![0] + rotated[3]![0]) / 2,
                            (rotated[2]![1] + rotated[3]![1]) / 2,
                          ],
                          yawRadians: angle,
                        },
                      }
                    : r,
                ),
              });
            }}
          >
            Rotate selected booth
          </Button>
        </div>
        {selectedRoom?.dimensionsFeet && (
          <p className="text-sm">
            Selected {selectedRoom.label ?? selectedRoom.id}: {selectedRoom.dimensionsFeet[0]} ×{' '}
            {selectedRoom.dimensionsFeet[1]} ft ={' '}
            {(selectedRoom.dimensionsFeet[0] * METRES_PER_FOOT).toFixed(4)} ×{' '}
            {(selectedRoom.dimensionsFeet[1] * METRES_PER_FOOT).toFixed(4)} m.
          </p>
        )}
        {selectedPlacement && (
          <Label>
            Selected asset scale
            <Input
              aria-label="Selected asset scale"
              disabled={calibrationRequired}
              type="number"
              min=".01"
              step=".1"
              value={selectedPlacement.scale[0]}
              onChange={(e) => {
                const scale = Number(e.target.value);
                if (scale > 0) {
                  patchAuthoring({
                    instances: authoring().instances.map((item) =>
                      item.id === selectedInstance
                        ? { ...item, scale: [scale, scale, scale] }
                        : item,
                    ),
                  });
                }
              }}
            />
          </Label>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const id = `floor-${crypto.randomUUID()}`;
              commit({
                ...source,
                schemaVersion: 2,
                floors: [
                  ...source.floors,
                  blankFloor(
                    id,
                    `Floor ${source.floors.length + 1}`,
                    Math.max(...source.floors.map((item) => item.heightOffset)) + 4.4,
                  ),
                ],
              });
              imageUpload.current++;
              cancelGesture();
              setFeatureSelection(null);
              setFloorId(id);
            }}
          >
            Add blank floor
          </Button>
          <Button
            variant="outline"
            disabled={source.floors.length <= 1}
            onClick={() =>
              commit({
                ...source,
                floors: source.floors.filter((f) => f.id !== floorId),
                rooms: source.rooms.filter((r) => r.floorId !== floorId),
                portals: source.portals
                  .map((p) => ({
                    ...p,
                    connects: p.connects.filter((id) => id !== floorId),
                    entries: p.entries?.filter((e) => e.floorId !== floorId),
                  }))
                  .filter((p) => p.connects.length >= 2),
              })
            }
          >
            Remove current floor
          </Button>
        </div>
        <PortalEditor
          source={source}
          portalId={portalId}
          setPortalId={setPortalId}
          commit={commit}
          chooseFloor={(id) => {
            cancelGesture();
            imageUpload.current++;
            inventoryDrag.current = null;
            setDropGhost(null);
            setFloorId(id);
            setTool('portal');
            setPoints([]);
            setZoom(1);
            setMessage(
              'Click the plan to place the connector entry. Facing applies to this entry.',
            );
          }}
        />
        {['boundary', 'obstacle', 'zone'].includes(tool) && (
          <div className="flex gap-2">
            <Button
              disabled={points.length < 3 || calibrationRequired}
              onClick={() =>
                tool === 'zone'
                  ? patchAuthoring({
                      zones: [
                        ...(authoring().zones ?? []),
                        {
                          id: crypto.randomUUID(),
                          label: 'New zone',
                          type: 'blocked',
                          polygon: points,
                        },
                      ],
                    })
                  : tool === 'boundary'
                    ? patchAuthoring({ boundary: points })
                    : patchAuthoring({ obstacles: [...authoring().obstacles, points] })
              }
            >
              Finish {tool} ({points.length} points)
            </Button>
            <Button variant="outline" onClick={() => setPoints([])}>
              Cancel drawing
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!selectedPlacement || calibrationRequired}
            onClick={() => {
              if (!selectedPlacement) {
                return;
              }
              const metric = sourceToMetres(selectedPlacement.position, floor?.coordinateSystem);
              const id = `asset-${crypto.randomUUID()}`;
              patchAuthoring({
                instances: [
                  ...authoring().instances,
                  {
                    ...selectedPlacement,
                    id,
                    position: metresToSource(
                      [metric[0] + 2, metric[1] + 2],
                      floor?.coordinateSystem,
                    ),
                  },
                ],
              });
              setSelectedInstance(id);
            }}
          >
            Duplicate selected asset
          </Button>
          <Button
            variant="outline"
            disabled={!selectedRoom || calibrationRequired}
            onClick={() => {
              if (!selectedRoom) {
                return;
              }
              const offset = (point: [number, number]): [number, number] => {
                const metric = sourceToMetres(point, floor?.coordinateSystem);
                return metresToSource([metric[0] + 2, metric[1] + 2], floor?.coordinateSystem);
              };
              const id = `booth-${crypto.randomUUID()}`;
              commit({
                ...source,
                rooms: [
                  ...source.rooms,
                  {
                    ...selectedRoom,
                    id,
                    polygon: selectedRoom.polygon.map(offset),
                    entrance: selectedRoom.entrance
                      ? {
                          ...selectedRoom.entrance,
                          position: offset(selectedRoom.entrance.position),
                        }
                      : undefined,
                  },
                ],
              });
              setRoomId(id);
              setSelectedInstance('');
            }}
          >
            Duplicate selected booth
          </Button>
          <Button
            variant="outline"
            disabled={!selectedInstance}
            onClick={() =>
              patchAuthoring({
                instances: authoring().instances.filter((item) => item.id !== selectedInstance),
              })
            }
          >
            Delete selected asset
          </Button>
          <Button
            variant="outline"
            disabled={!selectedInstance || calibrationRequired}
            onClick={() =>
              patchAuthoring({
                instances: authoring().instances.map((item) =>
                  item.id === selectedInstance
                    ? { ...item, yawRadians: (Number(yaw) * Math.PI) / 180 }
                    : item,
                ),
              })
            }
          >
            Rotate selected asset
          </Button>
          <Button
            variant="outline"
            disabled={!roomId}
            onClick={() =>
              commit({ ...source, rooms: source.rooms.filter((room) => room.id !== roomId) })
            }
          >
            Delete selected booth
          </Button>
          <Button variant="outline" onClick={() => patchAuthoring({ obstacles: [] })}>
            Clear blocked areas
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Label>
            Annotation
            <Select
              value={tool}
              onValueChange={(value) => {
                setTool(value);
                setPoints([]);
              }}
            >
              <SelectTrigger className="mt-2 w-full" aria-label="Annotation tool">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Annotation tool</SelectLabel>
                  <SelectItem value="inspect">Inspect</SelectItem>
                  <SelectItem value="room">Draw booth polygon</SelectItem>
                  <SelectItem value="wall">Draw wall</SelectItem>
                  <SelectItem value="zone">Draw zone</SelectItem>
                  <SelectItem value="poi">Place point of interest</SelectItem>
                  <SelectItem value="entrance">Room entrance</SelectItem>
                  <SelectItem value="portal">Portal entry</SelectItem>
                  <SelectItem value="forklift">Forklift service area</SelectItem>
                  <SelectItem value="pallet">Pallet service area</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Label>
          <Label>
            Room
            <Select
              value={roomId}
              onValueChange={(id) => {
                setRoomId(id);
                setSelectedInstance('');
              }}
            >
              <SelectTrigger className="mt-2 w-full" aria-label="Annotation room">
                <SelectValue placeholder="Choose a room" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Rooms on this floor</SelectLabel>
                  {source.rooms
                    .filter((r) => r.floorId === floorId)
                    .map((r) => (
                      <SelectItem value={r.id} key={r.id}>
                        {r.id}
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Label>
          <Label>
            Facing (degrees)
            <Input
              aria-label="Annotation facing"
              type="number"
              step="90"
              value={yaw}
              onChange={(e) => setYaw(e.target.value)}
            />
          </Label>
        </div>
        {tool === 'room' && (
          <div className="flex gap-2">
            <Input
              value={newRoomId}
              aria-label="New booth ID"
              onChange={(e) => setNewRoomId(e.target.value)}
            />
            <Button
              disabled={points.length < 3 || calibrationRequired}
              onClick={() =>
                commit({
                  ...source,
                  rooms: [
                    ...source.rooms,
                    { id: newRoomId, floorId, type: 'booth', polygon: points },
                  ],
                })
              }
            >
              Finish booth ({points.length} points)
            </Button>
            <Button variant="outline" onClick={() => setPoints([])}>
              Cancel drawing
            </Button>
          </div>
        )}
        {tool === 'portal' && (
          <Label>
            Portal
            <Select value={portalId} onValueChange={setPortalId}>
              <SelectTrigger className="mt-2 w-full" aria-label="Annotation portal">
                <SelectValue placeholder="Choose a portal" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Portals</SelectLabel>
                  {source.portals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.id} — {p.type}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Label>
        )}
        <p className="text-sm text-muted-foreground">
          Click the plan to annotate. Meter plans are shown at 12 pixels per meter. Image plans use
          their original pixel coordinates. Structural markers snap to 1 m after calibration;
          imported polygons stay unchanged. Pixel images fit the editor without changing source
          coordinates. Changing units preserves meter positions; changing calibration updates their
          scale. Entrances must lie on their room boundary.
        </p>
        <div className="overflow-auto rounded-xl border">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-card/95 px-3 py-2 backdrop-blur-md">
            <span className="text-xs text-muted-foreground">
              Canvas · {Math.round(zoom * 100)}%
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Zoom out"
                disabled={zoom <= 0.5}
                onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}
              >
                <ZoomOutIcon />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                aria-label="Reset zoom"
                onClick={() => setZoom(1)}
              >
                100%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Zoom in"
                disabled={zoom >= 2}
                onClick={() => setZoom((value) => Math.min(2, Number((value + 0.25).toFixed(2))))}
              >
                <ZoomInIcon />
              </Button>
            </div>
          </div>
          <div
            onDragOver={(event) => {
              const payload = inventoryDrag.current;
              if (!payload || !event.dataTransfer.types.includes(INVENTORY_DRAG_TYPE)) {
                return;
              }
              event.preventDefault();
              if (calibrationRequired) {
                event.dataTransfer.dropEffect = 'none';
                setDropGhost(null);
                return;
              }
              event.dataTransfer.dropEffect = 'copy';
              const rect = event.currentTarget.getBoundingClientRect();
              const position = snapPosition(
                [
                  (event.clientX - rect.left) / coordinateScale + viewOrigin[0],
                  (event.clientY - rect.top) / coordinateScale + viewOrigin[1],
                ],
                event.shiftKey,
              );
              setDropGhost((current) =>
                current?.position[0] === position[0] && current.position[1] === position[1]
                  ? current
                  : { payload, position },
              );
            }}
            onDragLeave={(event) => {
              if (
                !(event.relatedTarget instanceof Node) ||
                !event.currentTarget.contains(event.relatedTarget)
              ) {
                setDropGhost(null);
              }
            }}
            onDrop={(event) => {
              const payload = inventoryDrag.current;
              if (!payload) {
                return;
              }
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              placeInventory(
                payload,
                [
                  (event.clientX - rect.left) / coordinateScale + viewOrigin[0],
                  (event.clientY - rect.top) / coordinateScale + viewOrigin[1],
                ],
                event.shiftKey,
              );
              inventoryDrag.current = null;
              setDropGhost(null);
            }}
            style={{
              width,
              height,
              backgroundColor: '#16212b',
              backgroundImage: [
                floor?.image ? `url("${mediaUrl(floor.image)}")` : null,
                'repeating-conic-gradient(#1a2733 0% 25%, #16212b 0% 50%)',
              ]
                .filter(Boolean)
                .join(', '),
              backgroundSize:
                imageSize && pixel
                  ? `${imageSize[0] * coordinateScale}px ${imageSize[1] * coordinateScale}px, 16px 16px`
                  : 'auto, 16px 16px',
              backgroundRepeat: floor?.image ? 'no-repeat, repeat' : 'repeat',
              backgroundPosition: '0 0, 0 0',
            }}
          >
            <Stage
              width={width}
              height={height}
              onClick={(event) => {
                const cursor = event.target.getStage()?.getPointerPosition();
                if (!cursor || tool === 'inspect') {
                  return;
                }
                if (calibrationRequired && !['calibrate', 'calibrate-rectangle'].includes(tool)) {
                  setMessage('Calibrate or explicitly confirm the current physical scale first.');
                  return;
                }
                let position: [number, number] = [
                  cursor.x / coordinateScale + viewOrigin[0],
                  cursor.y / coordinateScale + viewOrigin[1],
                ];
                if (
                  ![
                    'room',
                    'entrance',
                    'calibrate',
                    'calibrate-rectangle',
                    'boundary',
                    'obstacle',
                    'booth-preset',
                    'wall',
                    'zone',
                  ].includes(tool)
                ) {
                  const calibration = floor?.coordinateSystem;
                  if (calibration?.units === 'pixels') {
                    const metres = sourceToMetres(position, calibration);
                    position = metresToSource(
                      [Math.round(metres[0]), Math.round(metres[1])],
                      calibration,
                    );
                  } else {
                    position = position.map(Math.round) as [number, number];
                  }
                }
                if (['wall', 'zone'].includes(tool) && !event.evt.shiftKey) {
                  const metric = sourceToMetres(position, floor?.coordinateSystem);
                  position = metresToSource(
                    [Math.round(metric[0] * 10) / 10, Math.round(metric[1] * 10) / 10],
                    floor?.coordinateSystem,
                  );
                }
                const yawRadians = (Number(yaw) * Math.PI) / 180;
                if (tool === 'calibrate-rectangle') {
                  if (!pixel) {
                    setMessage('Switch to image pixel coordinates to calibrate.');
                    return;
                  }
                  if (points.length < 2) {
                    setPoints([...points, position]);
                    return;
                  }
                  try {
                    patchFloor({
                      calibrationStatus: 'confirmed',
                      coordinateSystem: calibrateRectangle(
                        points[0]!,
                        points[1]!,
                        position,
                        feet[0] * METRES_PER_FOOT,
                        feet[1] * METRES_PER_FOOT,
                      ),
                    });
                    setMessage(
                      'Rectangle calibrated in both axes. Booth dimensions remain physical metres.',
                    );
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : 'Calibration failed.');
                  }
                  return;
                }
                if (tool === 'calibrate') {
                  if (!pixel) {
                    setMessage('Switch to image pixel coordinates to calibrate.');
                    return;
                  }
                  const first = points[0];
                  if (!first) {
                    setPoints([position]);
                    return;
                  }
                  const distance = Math.hypot(position[0] - first[0], position[1] - first[1]);
                  if (distance < 1) {
                    setMessage('Calibration points must be distinct.');
                    return;
                  }
                  patchFloor({
                    coordinateSystem: {
                      units: 'pixels',
                      origin: pixelCoordinates!.origin,
                      metersPerPixel: (calibrationFeet * METRES_PER_FOOT) / distance,
                    },
                    calibrationStatus: 'confirmed',
                  });
                  setMessage(
                    `Calibrated ${calibrationFeet} ft = ${(calibrationFeet * METRES_PER_FOOT).toFixed(4)} m.`,
                  );
                  return;
                }
                if (tool === 'wall') {
                  if (!points[0]) {
                    setPoints([position]);
                    return;
                  }
                  const start = sourceToMetres(points[0], floor?.coordinateSystem),
                    end = sourceToMetres(position, floor?.coordinateSystem);
                  if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 0.1) {
                    setMessage('Wall endpoints must be at least 0.1 m apart.');
                    return;
                  }
                  const id = crypto.randomUUID();
                  patchAuthoring({
                    walls: [
                      ...(authoring().walls ?? []),
                      {
                        id,
                        start: points[0],
                        end: position,
                        thickness: 0.12,
                        height: 2.8,
                        openings: [],
                      },
                    ],
                  });
                  setFeatureSelection({ kind: 'wall', id });
                  return;
                }
                if (tool === 'poi') {
                  const id = crypto.randomUUID();
                  patchAuthoring({
                    pois: [
                      ...(authoring().pois ?? []),
                      { id, label: 'New point of interest', type: 'custom', position },
                    ],
                  });
                  setFeatureSelection({ kind: 'poi', id });
                  return;
                }
                if (tool === 'booth-preset') {
                  placeInventory({ kind: 'booth', feet }, position, event.evt.shiftKey);
                  return;
                }
                if (tool === 'asset') {
                  placeInventory({ kind: 'asset', choice }, position, event.evt.shiftKey);
                  return;
                }
                if (tool === 'spawn') {
                  patchAuthoring({ spawn: position });
                  return;
                }
                if (['boundary', 'obstacle', 'zone'].includes(tool)) {
                  setPoints([...points, position]);
                  return;
                }
                if (tool === 'room') {
                  setPoints([...points, position]);
                  return;
                }
                if (tool === 'entrance') {
                  commit({
                    ...source,
                    rooms: source.rooms.map((r) =>
                      r.id === roomId ? { ...r, entrance: { position, yawRadians } } : r,
                    ),
                  });
                }
                if (tool === 'portal') {
                  commit({
                    ...source,
                    portals: source.portals.map((p) =>
                      p.id === portalId
                        ? {
                            ...p,
                            entries: [
                              ...(p.entries ?? []).filter((entry) => entry.floorId !== floorId),
                              { floorId, position, yawRadians },
                            ],
                          }
                        : p,
                    ),
                  });
                }
                if (tool === 'pallet' || tool === 'forklift') {
                  patchFloor({
                    logisticsAnchors: [
                      ...(floor?.logisticsAnchors ?? []),
                      { id: `${tool}-${Date.now()}`, assetId: tool, position, yawRadians },
                    ],
                  });
                }
              }}
            >
              <Layer>
                {source.rooms
                  .filter((r) => r.floorId === floorId)
                  .map((r) => (
                    <KonvaLine
                      key={r.id}
                      ref={(node) => {
                        if (node) {
                          transformNodes.current.set(`booth:${r.id}`, node);
                        } else {
                          transformNodes.current.delete(`booth:${r.id}`);
                        }
                      }}
                      onTransformStart={(event) => {
                        gesture.current = { node: event.target, cancelled: false };
                      }}
                      onTransformEnd={(event) =>
                        finishInventoryTransform(
                          'booth',
                          r.id,
                          event.target,
                          'shiftKey' in event.evt && Boolean(event.evt.shiftKey),
                        )
                      }
                      points={r.polygon.flatMap(([x, y]) => [
                        (x - viewOrigin[0]) * coordinateScale,
                        (y - viewOrigin[1]) * coordinateScale,
                      ])}
                      closed
                      stroke="#38bdf8"
                      strokeWidth={2}
                      fill="rgba(56,189,248,.15)"
                      draggable={tool === 'inspect' && !calibrationRequired}
                      onClick={() => {
                        setRoomId(r.id);
                        setSelectedInstance('');
                      }}
                      onDragStart={(event) => {
                        gesture.current = { node: event.target, cancelled: false };
                      }}
                      onDragEnd={(event) => {
                        if (gesture.current?.cancelled) {
                          gesture.current = null;
                          return;
                        }
                        gesture.current = null;
                        const center = r.polygon.reduce(
                          (sum, point) =>
                            [
                              sum[0] + point[0] / r.polygon.length,
                              sum[1] + point[1] / r.polygon.length,
                            ] as [number, number],
                          [0, 0] as [number, number],
                        );
                        const moved = sourceToMetres(
                          [
                            center[0] + event.target.x() / coordinateScale,
                            center[1] + event.target.y() / coordinateScale,
                          ],
                          floor?.coordinateSystem,
                        );
                        const snapped = metresToSource(
                          event.evt.shiftKey
                            ? moved
                            : [Math.round(moved[0] * 10) / 10, Math.round(moved[1] * 10) / 10],
                          floor?.coordinateSystem,
                        );
                        const dx = snapped[0] - center[0],
                          dy = snapped[1] - center[1];
                        event.target.position({ x: 0, y: 0 });
                        commit({
                          ...source,
                          rooms: source.rooms.map((room) =>
                            room.id === r.id
                              ? {
                                  ...room,
                                  polygon: room.polygon.map(([x, y]) => [x + dx, y + dy]),
                                  entrance: room.entrance
                                    ? {
                                        ...room.entrance,
                                        position: [
                                          room.entrance.position[0] + dx,
                                          room.entrance.position[1] + dy,
                                        ],
                                      }
                                    : undefined,
                                }
                              : room,
                          ),
                        });
                      }}
                    />
                  ))}
                {source.rooms
                  .filter((r) => r.floorId === floorId && r.entrance)
                  .map((r) => (
                    <Circle
                      key={r.id}
                      x={((r.entrance?.position[0] ?? 0) - viewOrigin[0]) * coordinateScale}
                      y={((r.entrance?.position[1] ?? 0) - viewOrigin[1]) * coordinateScale}
                      radius={4}
                      fill="#22c55e"
                    />
                  ))}
                {source.portals.flatMap((portal) =>
                  (portal.entries ?? [])
                    .filter((entry) => entry.floorId === floorId)
                    .map((entry) => (
                      <Group
                        key={portal.id}
                        draggable={tool === 'inspect' && !calibrationRequired}
                        onClick={(event) => {
                          if (tool !== 'inspect') {
                            return;
                          }
                          event.cancelBubble = true;
                          setPortalId(portal.id);
                        }}
                        onDragStart={(event) => {
                          gesture.current = { node: event.currentTarget, cancelled: false };
                        }}
                        onDragEnd={(event) => {
                          if (gesture.current?.cancelled) {
                            gesture.current = null;
                            return;
                          }
                          gesture.current = null;
                          const position = snapPosition(
                            [
                              entry.position[0] + event.currentTarget.x() / coordinateScale,
                              entry.position[1] + event.currentTarget.y() / coordinateScale,
                            ],
                            event.evt.shiftKey,
                          );
                          event.currentTarget.position({ x: 0, y: 0 });
                          commit({
                            ...source,
                            portals: source.portals.map((item) =>
                              item.id === portal.id
                                ? {
                                    ...item,
                                    entries: item.entries?.map((value) =>
                                      value.floorId === floorId ? { ...value, position } : value,
                                    ),
                                  }
                                : item,
                            ),
                          });
                        }}
                      >
                        <Circle
                          x={(entry.position[0] - viewOrigin[0]) * coordinateScale}
                          y={(entry.position[1] - viewOrigin[1]) * coordinateScale}
                          radius={6}
                          fill={portalId === portal.id ? '#fff' : '#a78bfa'}
                        />
                        <KonvaText
                          x={(entry.position[0] - viewOrigin[0]) * coordinateScale + 9}
                          y={(entry.position[1] - viewOrigin[1]) * coordinateScale - 6}
                          text={portal.type}
                          fill="#a78bfa"
                          fontSize={11}
                        />
                      </Group>
                    )),
                )}
                {(floor?.logisticsAnchors ?? []).map((a) => (
                  <Circle
                    key={a.id}
                    x={(a.position[0] - viewOrigin[0]) * coordinateScale}
                    y={(a.position[1] - viewOrigin[1]) * coordinateScale}
                    radius={5}
                    fill="#fbbf24"
                  />
                ))}
                {floor?.authoring && (
                  <KonvaLine
                    points={floor.authoring.boundary.flatMap(([x, y]) => [
                      (x - viewOrigin[0]) * coordinateScale,
                      (y - viewOrigin[1]) * coordinateScale,
                    ])}
                    closed
                    stroke="#22c55e"
                    strokeWidth={2}
                    listening={false}
                  />
                )}
                {floor?.authoring?.obstacles.map((area, i) => (
                  <KonvaLine
                    key={`obstacle-${i}`}
                    points={area.flatMap(([x, y]) => [
                      (x - viewOrigin[0]) * coordinateScale,
                      (y - viewOrigin[1]) * coordinateScale,
                    ])}
                    closed
                    stroke="#f87171"
                    fill="rgba(248,113,113,.3)"
                  />
                ))}
                {floor?.authoring?.instances.map((item) => {
                  const footprint = boothRectangle(
                    sourceToMetres(item.position, floor.coordinateSystem),
                    [
                      (item.dimensions[0] * item.scale[0]) / METRES_PER_FOOT,
                      (item.dimensions[2] * item.scale[2]) / METRES_PER_FOOT,
                    ],
                    item.yawRadians,
                  ).map((p) => metresToSource(p, floor.coordinateSystem));
                  return (
                    <KonvaLine
                      key={item.id}
                      ref={(node) => {
                        if (node) {
                          transformNodes.current.set(`asset:${item.id}`, node);
                        } else {
                          transformNodes.current.delete(`asset:${item.id}`);
                        }
                      }}
                      onTransformStart={(event) => {
                        gesture.current = { node: event.target, cancelled: false };
                      }}
                      onTransformEnd={(event) =>
                        finishInventoryTransform(
                          'asset',
                          item.id,
                          event.target,
                          'shiftKey' in event.evt && Boolean(event.evt.shiftKey),
                        )
                      }
                      points={footprint.flatMap(([x, y]) => [
                        (x - viewOrigin[0]) * coordinateScale,
                        (y - viewOrigin[1]) * coordinateScale,
                      ])}
                      closed
                      fill="rgba(251,191,36,.6)"
                      stroke={selectedInstance === item.id ? '#fff' : '#fbbf24'}
                      draggable={tool === 'inspect' && !calibrationRequired}
                      onClick={() => setSelectedInstance(item.id)}
                      onDragStart={(event) => {
                        gesture.current = { node: event.target, cancelled: false };
                      }}
                      onDragEnd={(event) => {
                        if (gesture.current?.cancelled) {
                          gesture.current = null;
                          return;
                        }
                        gesture.current = null;
                        const moved = sourceToMetres(
                          [
                            item.position[0] + event.target.x() / coordinateScale,
                            item.position[1] + event.target.y() / coordinateScale,
                          ],
                          floor.coordinateSystem,
                        );
                        const snapped = metresToSource(
                          event.evt.shiftKey
                            ? moved
                            : [Math.round(moved[0] * 10) / 10, Math.round(moved[1] * 10) / 10],
                          floor.coordinateSystem,
                        );
                        const dx = snapped[0] - item.position[0],
                          dy = snapped[1] - item.position[1];
                        event.target.position({ x: 0, y: 0 });
                        patchAuthoring({
                          instances: authoring().instances.map((a) =>
                            a.id === item.id
                              ? { ...a, position: [a.position[0] + dx, a.position[1] + dy] }
                              : a,
                          ),
                        });
                      }}
                    />
                  );
                })}
                {source.rooms
                  .filter((room) => room.floorId === floorId && room.dimensionsFeet)
                  .map((room) => (
                    <KonvaText
                      key={`label-${room.id}`}
                      x={(room.polygon[0]![0] - viewOrigin[0]) * coordinateScale}
                      y={(room.polygon[0]![1] - viewOrigin[1]) * coordinateScale}
                      text={`${room.label ?? room.id}\n${room.dimensionsFeet![0]} × ${room.dimensionsFeet![1]} ft`}
                      fontSize={10}
                      fill="#fff"
                      listening={false}
                    />
                  ))}
                {(floor?.authoring?.walls ?? []).map((wall) => {
                  const start = sourceToMetres(wall.start, floor?.coordinateSystem),
                    end = sourceToMetres(wall.end, floor?.coordinateSystem);
                  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
                  const linePoints = (positions: Array<[number, number]>) =>
                    positions.flatMap(([x, y]) => [
                      (x - viewOrigin[0]) * coordinateScale,
                      (y - viewOrigin[1]) * coordinateScale,
                    ]);
                  return (
                    <Group
                      key={`wall-${wall.id}`}
                      draggable={tool === 'inspect' && !calibrationRequired}
                      onClick={(event) => {
                        if (tool !== 'inspect') {
                          return;
                        }
                        event.cancelBubble = true;
                        setFeatureSelection({ kind: 'wall', id: wall.id });
                      }}
                      onDragStart={(event) => {
                        gesture.current = { node: event.currentTarget, cancelled: false };
                      }}
                      onDragEnd={(event) =>
                        moveFeature('wall', wall.id, event.currentTarget, event.evt.shiftKey)
                      }
                    >
                      <KonvaLine
                        points={linePoints([wall.start, wall.end])}
                        stroke={featureSelection?.id === wall.id ? '#fff' : '#c4b5fd'}
                        strokeWidth={5}
                      />
                      {(wall.openings ?? []).map((opening) => (
                        <KonvaLine
                          key={opening.id}
                          stroke="#22c55e"
                          strokeWidth={6}
                          points={linePoints(
                            [
                              opening.offset - opening.width / 2,
                              opening.offset + opening.width / 2,
                            ].map((offset) =>
                              metresToSource(
                                [
                                  start[0] + ((end[0] - start[0]) * offset) / length,
                                  start[1] + ((end[1] - start[1]) * offset) / length,
                                ],
                                floor?.coordinateSystem,
                              ),
                            ),
                          )}
                        />
                      ))}
                    </Group>
                  );
                })}
                {(floor?.authoring?.zones ?? []).map((zone) => (
                  <KonvaLine
                    key={`zone-${zone.id}`}
                    points={zone.polygon.flatMap(([x, y]) => [
                      (x - viewOrigin[0]) * coordinateScale,
                      (y - viewOrigin[1]) * coordinateScale,
                    ])}
                    closed
                    stroke={featureSelection?.id === zone.id ? '#fff' : '#fb923c'}
                    fill={zone.type === 'blocked' ? 'rgba(248,113,113,.3)' : 'rgba(251,146,60,.12)'}
                    onClick={(event) => {
                      if (tool !== 'inspect') {
                        return;
                      }
                      event.cancelBubble = true;
                      setFeatureSelection({ kind: 'zone', id: zone.id });
                    }}
                    draggable={tool === 'inspect' && !calibrationRequired}
                    onDragStart={(event) => {
                      gesture.current = { node: event.target, cancelled: false };
                    }}
                    onDragEnd={(event) =>
                      moveFeature('zone', zone.id, event.target, event.evt.shiftKey)
                    }
                  />
                ))}
                {(floor?.authoring?.pois ?? []).map((poi) => (
                  <Group
                    key={`poi-${poi.id}`}
                    draggable={tool === 'inspect' && !calibrationRequired}
                    onClick={(event) => {
                      if (tool !== 'inspect') {
                        return;
                      }
                      event.cancelBubble = true;
                      setFeatureSelection({ kind: 'poi', id: poi.id });
                    }}
                    onDragStart={(event) => {
                      gesture.current = { node: event.currentTarget, cancelled: false };
                    }}
                    onDragEnd={(event) =>
                      moveFeature('poi', poi.id, event.currentTarget, event.evt.shiftKey)
                    }
                  >
                    <Circle
                      x={(poi.position[0] - viewOrigin[0]) * coordinateScale}
                      y={(poi.position[1] - viewOrigin[1]) * coordinateScale}
                      radius={6}
                      fill={featureSelection?.id === poi.id ? '#fff' : '#f472b6'}
                    />
                    <KonvaText
                      x={(poi.position[0] - viewOrigin[0]) * coordinateScale + 9}
                      y={(poi.position[1] - viewOrigin[1]) * coordinateScale - 6}
                      text={poi.label}
                      fontSize={11}
                      fill="#f472b6"
                    />
                  </Group>
                ))}
                <KonvaTransformer
                  ref={transformer}
                  flipEnabled={false}
                  keepRatio={false}
                  rotateEnabled
                  rotationSnaps={[0, 90, 180, 270]}
                  rotationSnapTolerance={5}
                  boundBoxFunc={(old, next) =>
                    Math.abs(next.width) < 2 || Math.abs(next.height) < 2 ? old : next
                  }
                />
                {dropGhost && (
                  <KonvaLine
                    points={ghostPolygon.flatMap(([x, y]) => [
                      (x - viewOrigin[0]) * coordinateScale,
                      (y - viewOrigin[1]) * coordinateScale,
                    ])}
                    closed
                    fill="rgba(34,197,94,.25)"
                    stroke="#22c55e"
                    dash={[6, 4]}
                    strokeWidth={2}
                    listening={false}
                  />
                )}
                <KonvaLine
                  points={points.flatMap(([x, y]) => [
                    (x - viewOrigin[0]) * coordinateScale,
                    (y - viewOrigin[1]) * coordinateScale,
                  ])}
                  stroke="#fbbf24"
                  strokeWidth={2}
                />
              </Layer>
            </Stage>
          </div>
        </div>
        <Label>
          Layout JSON
          <Textarea
            aria-label="Layout JSON"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-64 font-mono text-[11px] leading-relaxed"
          />
        </Label>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              try {
                update(JSON.parse(draft)).match(
                  () => setMessage('Layout applied.'),
                  (error) => setMessage(error.message),
                );
              } catch {
                setMessage('Invalid JSON. Last valid layout retained.');
              }
            }}
          >
            Apply layout
          </Button>
          <Button variant="outline" onClick={download}>
            <DownloadIcon />
            Export JSON
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              imageUpload.current++;
              cancelGesture();
              commit(stressSource);
            }}
          >
            Load reference venue
          </Button>
          <VenueKitStarter
            currentLayout={source}
            onGenerate={(layout) => {
              if (draft !== JSON.stringify(source, null, 2)) {
                setMessage(
                  'Save or discard the unsaved JSON layout draft before replacing the editor layout.',
                );
                return false;
              }
              imageUpload.current++;
              cancelGesture();
              setFeatureSelection(null);
              setSelectedInstance('');
              setPoints([]);
              setTool('inspect');
              setZoom(1);
              return commit({ ...layout, buildingId: source.buildingId });
            }}
          />
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const response = await fetch(mediaUrl('/floor-assets/luminary-layout.json'));
                if (!response.ok) {
                  throw new Error('Luminary layout unavailable.');
                }
                const data: unknown = await response.json();
                imageUpload.current++;
                cancelGesture();
                commit(data as BuildingLayout);
              } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Could not load venue.');
              }
            }}
          >
            Load calibrated Luminary
          </Button>
        </div>
        {message && (
          <p role="status" aria-live="polite">
            {message}
          </p>
        )}
        {diagnostics.length > 0 && (
          <Alert>
            <AlertTitle>Portal placement needs attention</AlertTitle>
            <AlertDescription>
              {diagnostics.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
