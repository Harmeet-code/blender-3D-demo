import { useEffect, useMemo, useState } from 'react';
import { Stage, Layer, Line as KonvaLine, Circle } from 'react-konva';
import { DownloadIcon } from 'lucide-react';
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
import { useLayoutStore } from '../../entities/building/model/layout-store.ts';
import { normalizeLayout } from '../../entities/building/model/normalize-layout.ts';
import { portalPlacements } from '../../entities/building/model/portal-placement.ts';
import { stressSource } from '../../entities/building/model/asset-stress-layout.ts';
import type { BuildingLayout } from '../../entities/building/model/building-schema.ts';
import { reexpressFloor } from '../../entities/building/model/reexpress-floor.ts';
export function FloorPlanEditor() {
  const source = useLayoutStore((s) => s.source),
    update = useLayoutStore((s) => s.update);
  const [draft, setDraft] = useState(JSON.stringify(source, null, 2)),
    [floorId, setFloorId] = useState(source.floors[0]?.id ?? '');
  const [message, setMessage] = useState(''),
    [tool, setTool] = useState('inspect'),
    [roomId, setRoomId] = useState(source.rooms[0]?.id ?? '');
  const [portalId, setPortalId] = useState(source.portals[0]?.id ?? ''),
    [points, setPoints] = useState<Array<[number, number]>>([]);
  const [yaw, setYaw] = useState('0'),
    [newRoomId, setNewRoomId] = useState('booth-new');
  useEffect(() => setDraft(JSON.stringify(source, null, 2)), [source]);
  const parsed = useMemo(() => {
    try {
      return normalizeLayout(JSON.parse(draft));
    } catch {
      return null;
    }
  }, [draft]);
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
    setImageSize(null);
    if (!floor?.image.startsWith('data:image/')) {
      return;
    }
    const image = new Image();
    image.onload = () => setImageSize([image.naturalWidth, image.naturalHeight]);
    image.src = floor.image;
    return () => {
      image.onload = null;
    };
  }, [floor?.image]);
  const coordinateScale = pixel
      ? imageSize
        ? Math.min(600 / imageSize[0], 360 / imageSize[1])
        : 1
      : 12,
    width = 600,
    height = 360;
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
    commit({
      ...source,
      floors: source.floors.map((f) => (f.id === floorId ? { ...f, ...patch } : f)),
    });
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
        <div className="grid gap-3 sm:grid-cols-3">
          <Label>
            Floor
            <Select
              value={floorId}
              onValueChange={(value) => {
                setFloorId(value);
                setPoints([]);
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
          Floor image (PNG/JPEG/WebP, up to 10 MiB)
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Floor image"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) {
                return;
              }
              if (
                !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
                file.size > 10 * 1024 * 1024
              ) {
                setMessage('Choose a PNG, JPEG, or WebP under 10 MiB.');
                return;
              }
              try {
                const bitmap = await createImageBitmap(file);
                const valid = bitmap.width <= 8192 && bitmap.height <= 8192;
                bitmap.close();
                if (!valid) {
                  setMessage('Floor image dimensions must not exceed 8192 pixels.');
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === 'string') {
                    changeCoordinates(
                      { units: 'pixels', metersPerPixel: 0.01, origin: [0, 0] },
                      reader.result,
                    );
                  }
                };
                reader.onerror = () =>
                  setMessage('The image could not be read. Choose another file.');
                reader.readAsDataURL(file);
              } catch {
                setMessage('The image could not be decoded. Choose another file.');
              }
              e.target.value = '';
            }}
          />
        </Label>
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
            <Select value={roomId} onValueChange={setRoomId}>
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
              disabled={points.length < 3}
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
        <div className="overflow-auto rounded border">
          <div
            style={{
              width,
              height,
              background: '#16212b',
              backgroundImage: floor?.image.startsWith('data:image/')
                ? `url("${floor.image}")`
                : undefined,
              backgroundSize:
                imageSize && pixel
                  ? `${imageSize[0] * coordinateScale}px ${imageSize[1] * coordinateScale}px`
                  : 'auto',
              backgroundRepeat: 'no-repeat',
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
                let position: [number, number] = [
                  cursor.x / coordinateScale + viewOrigin[0],
                  cursor.y / coordinateScale + viewOrigin[1],
                ];
                if (tool !== 'room' && tool !== 'entrance') {
                  const calibration = floor?.coordinateSystem;
                  if (calibration?.units === 'pixels') {
                    position = position.map(
                      (n, i) =>
                        Math.round(
                          (n - (calibration.origin[i] ?? 0)) * calibration.metersPerPixel,
                        ) /
                          calibration.metersPerPixel +
                        (calibration.origin[i] ?? 0),
                    ) as [number, number];
                  } else {
                    position = position.map(Math.round) as [number, number];
                  }
                }
                const yawRadians = (Number(yaw) * Math.PI) / 180;
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
                      points={r.polygon.flatMap(([x, y]) => [
                        (x - viewOrigin[0]) * coordinateScale,
                        (y - viewOrigin[1]) * coordinateScale,
                      ])}
                      closed
                      stroke="#38bdf8"
                      strokeWidth={2}
                      fill="rgba(56,189,248,.15)"
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
                {source.portals.flatMap((p) =>
                  (p.entries ?? [])
                    .filter((entry) => entry.floorId === floorId)
                    .map((entry) => (
                      <Circle
                        key={p.id}
                        x={(entry.position[0] - viewOrigin[0]) * coordinateScale}
                        y={(entry.position[1] - viewOrigin[1]) * coordinateScale}
                        radius={5}
                        fill="#a78bfa"
                      />
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
            className="min-h-64 font-mono text-xs"
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
          <Button variant="outline" onClick={() => commit(stressSource)}>
            Load reference venue
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
