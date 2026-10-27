import { useEffect, useMemo, useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Line, OrbitControls, OrthographicCamera } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { createObject } from '../../model/inventory.ts';
import { useWayfindingRoute } from '../navigation/use-wayfinding-route.ts';
import { RoutePicker } from './RoutePicker.tsx';
import type { PlanDocument, PlanObject } from '../../model/types.ts';
import { blankDocument } from '../../model/adapter.ts';
import { buildFloorNavInput } from '../navigation/input-builder.ts';

import { RouteVisuals } from '../rendering/RouteVisuals.tsx';
import { ProceduralObject } from '../../components/ProceduralObject.tsx';
import { RouteCard } from './RouteCard.tsx';
import { PlaybackHUD } from './PlaybackHUD.tsx';
import { GameScene } from '../game/GameScene.tsx';
import { Minimap } from '../rendering/Minimap.tsx';
import { WalkthroughLayer } from '../walkthrough/WalkthroughLayer.tsx';
import { PlaybackMotionProvider } from '../walkthrough/motion-context.tsx';
import { usePlaybackStore } from '../store/playback-store.ts';
import { fitCirculation } from '../../model/circulation.ts';
import { routeGhostIds } from '../rendering/route-ghost.ts';
import { ViewportCameraPersistence } from '../../components/ViewportCameraPersistence.tsx';

import { useWayfindingStore, selectActiveResult } from '../store/wayfinding-store.ts';
import type { WalkableZone } from '../model/zone-schema.ts';
import type { Point2 } from '../navigation/input-builder.ts';

type Scenario =
  | 'hall'
  | 'stairs'
  | 'ramp'
  | 'escalator'
  | 'elevator'
  | 'restricted'
  | 'performance';
function seedDocument(scenario: Scenario): PlanDocument {
  const document = blankDocument('wayfinding-preview');
  const floor = document.floors[0]!;
  floor.boundary = [
    [-10, -6],
    [10, -6],
    [10, 6],
    [-10, 6],
  ];
  const booth = (x: number, z: number): PlanObject => ({
    ...createObject('booth', [x, z]),
    position: [x, z],
    boothDesign: { ...createObject('booth', [x, z]).boothDesign!, roof: 'solid' },
  });
  floor.objects = [
    booth(-4, -3),
    booth(0, -3),
    booth(4, -3),
    { ...createObject('bench', [-2, 2]), position: [-2, 2] },
    { ...createObject('planter', [3, 2]), position: [3, 2] },
  ];
  if (scenario === 'hall') {
    floor.objects.push({
      ...createObject('entrance', [0, 2.5]),
      yawRadians: Math.PI / 2,
      entranceGate: 'arch-sliding-doors',
      entranceOpen: true,
    });
  }
  if (scenario === 'performance') {
    floor.boundary = [
      [-55, -38],
      [55, -38],
      [55, 38],
      [-55, 38],
    ];
    floor.objects = Array.from({ length: 300 }, (_, i) => {
      const row = Math.floor(i / 25),
        col = i % 25;
      const z = row < 6 ? -8 - row * 4 : 8 + (row - 6) * 4;
      return createObject(i % 15 === 0 ? 'booth' : i % 5 === 0 ? 'planter' : 'chair', [
        col * 4 - 48,
        z,
      ]);
    });
  }
  if (['stairs', 'ramp', 'escalator', 'elevator'].includes(scenario)) {
    const upper = structuredClone(floor);
    const rise = scenario === 'ramp' ? 1.2 : 3;
    upper.source = {
      ...upper.source,
      id: 'preview-upper',
      name: 'Upper floor',
      heightOffset: rise,
    };
    upper.objects = [];
    floor.boundary = [
      [-12, -8],
      [12, -8],
      [12, 8],
      [-12, 8],
    ];
    upper.boundary = structuredClone(floor.boundary);
    const lower = fitCirculation({
      ...createObject(scenario as 'stairs' | 'ramp' | 'escalator' | 'elevator', [8, 0]),
      dimensions: scenario === 'elevator' ? [2.5, rise, 2.5] : [2, rise, 8],
      steps: 18,
    });
    lower.portalId = 'preview-connector';
    if (scenario === 'ramp') {
      floor.boundary = [
        [-30, -30],
        [30, -30],
        [30, 30],
        [-30, 30],
      ];
      upper.boundary = structuredClone(floor.boundary);
    }
    const top = {
      ...structuredClone(lower),
      id: 'preview-top',
      circulationDesign: { ...lower.circulationDesign!, role: 'upper' as const },
    };
    floor.objects.push(lower);
    upper.objects.push(top);
    document.floors.push(upper);
  }
  return document;
}

const SEED_ZONES: WalkableZone[] = [
  {
    id: 'hall',
    floorId: '',
    name: 'Main hall',
    type: 'general',
    polygon: [
      [-9, -5],
      [9, -5],
      [9, 5],
      [-9, 5],
    ],
    holes: [],
    revision: 0,
  },
];

function FloorTap({ onPick }: { onPick: (point: Point2) => void }) {
  const pick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta > 3) {
      return;
    }
    onPick([event.point.x, event.point.z]);
  };
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} onClick={pick} receiveShadow>
      <planeGeometry args={[120, 80]} />
      <meshStandardMaterial color="#C2CBC7" roughness={0.92} />
    </mesh>
  );
}

export default function WayfindingPreview() {
  const [scenario, setScenario] = useState<Scenario>(() => {
    const requested = new URLSearchParams(window.location.search).get('scenario');
    return [
      'hall',
      'stairs',
      'ramp',
      'escalator',
      'elevator',
      'restricted',
      'performance',
    ].includes(requested ?? '')
      ? (requested as Scenario)
      : 'hall';
  });
  const seed = useMemo(() => seedDocument(scenario), [scenario]);
  const [edit, setEdit] = useState(0);
  const document = useMemo(() => {
    const next = structuredClone(seed);
    for (const item of next.floors) {
      const planter = item.objects.find((object) => object.recipe === 'planter');
      if (planter && edit % 3 === 1) {
        planter.position = [0, 4];
      }
      if (edit % 3 === 2) {
        item.objects = item.objects.filter((object) => object.recipe !== 'planter');
      }
    }
    return next;
  }, [seed, edit]);
  const [floorIndex, setFloorIndex] = useState(0);
  const floor = document.floors[floorIndex] ?? document.floors[0]!;
  const zones = useMemo<WalkableZone[]>(
    () =>
      document.floors.flatMap((item) => [
        ...SEED_ZONES.map((zone) =>
          Object.assign({}, zone, {
            id: `hall-${item.source.id}`,
            floorId: item.source.id,
            polygon:
              scenario === 'performance'
                ? [
                    [-54, -37],
                    [54, -37],
                    [54, 37],
                    [-54, 37],
                  ]
                : scenario === 'ramp'
                  ? [
                      [-29, -29],
                      [29, -29],
                      [29, 29],
                      [-29, 29],
                    ]
                  : scenario === 'stairs' || scenario === 'elevator' || scenario === 'escalator'
                    ? [
                        [-11, -7],
                        [11, -7],
                        [11, 7],
                        [-11, 7],
                      ]
                    : zone.polygon,
          }),
        ),
        ...(scenario === 'restricted'
          ? [
              {
                id: 'restricted',
                floorId: item.source.id,
                name: 'Staff only',
                type: 'restricted' as const,
                polygon: [
                  [-1, 0],
                  [1, 0],
                  [1, 5],
                  [-1, 5],
                ] as Point2[],
                holes: [],
                revision: 0,
              },
            ]
          : []),
      ]),
    [document, scenario],
  );
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const paramPoint = (key: string, fallback: Point2): Point2 => {
    const raw = params.get(key)?.split(',').map(Number);
    if (raw?.length === 2 && raw.every((value) => Number.isFinite(value))) {
      return [raw[0]!, raw[1]!];
    }
    return fallback;
  };
  const [picking, setPicking] = useState<'start' | 'dest' | null>(null);

  const animated = useWayfindingStore((state) => state.animated);
  const setAnimated = useWayfindingStore((state) => state.setAnimated);
  const [progress, setProgress] = useState(0);
  const cameraAudit = usePlaybackStore((state) => state.cameraAudit);
  const [topDown, setTopDown] = useState(false);
  const routing = useWayfindingStore((state) => state.status === 'routing');
  const failure = useWayfindingStore(
    (state) => state.outcome?.failures?.[state.option] ?? state.failure,
  );

  const request = useWayfindingStore((state) => state.request);
  const setRequest = useWayfindingStore((state) => state.setRequest);
  const option = useWayfindingStore((state) => state.option);
  const setOption = useWayfindingStore((state) => state.setOption);
  const liveRoute = useWayfindingStore(selectActiveResult);
  const playback = usePlaybackStore((state) => state.session);
  const active = playback?.route ?? liveRoute;
  const ghostIds = useMemo(() => {
    const ids = new Set<string>();
    for (const segment of active?.segments ?? []) {
      if (segment.toFloorId || segment.floorId !== floor.source.id) {
        continue;
      }
      for (const id of routeGhostIds(
        segment.points.map(([x, , z]) => [x, z]),
        floor.objects,
      )) {
        ids.add(id);
      }
    }
    return ids;
  }, [active, floor]);
  useWayfindingRoute(document, 0, zones, () => {});
  const seedRequest = (nearBooth = false) =>
    setRequest({
      start: {
        floorId: document.floors[0]!.source.id,
        kind: 'point',
        point: paramPoint('start', scenario === 'performance' ? [-45, 0] : [-8, 4]),
      },
      dest: {
        floorId: document.floors.at(-1)!.source.id,
        kind: 'point',
        point: nearBooth
          ? [0, -4.5]
          : paramPoint('dest', scenario === 'performance' ? [45, 0] : [8, 4]),
      },
      accessibleOnly: false,
      allowRestricted: false,
    });
  useEffect(() => {
    seedRequest();
  }, [seed]);
  const input = useMemo(
    () =>
      buildFloorNavInput(
        floor.source.id,
        floor.boundary as Point2[],
        zones,
        floor.objects,
        scenario !== 'performance',
      ),
    [floor, zones],
  );

  const pick = (point: Point2) => {
    if (!picking) {
      return;
    }
    const endpoint = { floorId: floor.source.id, kind: 'point' as const, point };
    setRequest({
      start: picking === 'start' ? endpoint : (request?.start ?? endpoint),
      dest: picking === 'dest' ? endpoint : (request?.dest ?? endpoint),
      accessibleOnly: option === 'accessible',
      allowRestricted: request?.allowRestricted ?? false,
    });
    setPicking(null);
  };
  return (
    <main className="flex h-dvh min-h-0 flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h1 className="text-xl font-semibold">Wayfinding route visuals</h1>
          <p className="mt-1 text-sm text-slate-400">
            Phase 4 preview — lighting and minimap
          </p>
        </div>
        <a className="text-sm underline" href="/admin/floor-plan?eventId=floor-plan-studio">
          Open floor plan studio
        </a>
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-3 text-sm">
        <Button
          variant={picking === 'start' ? 'default' : 'outline'}
          onClick={() => setPicking('start')}
        >
          Pick start
        </Button>
        <Button
          variant={picking === 'dest' ? 'default' : 'outline'}
          onClick={() => setPicking('dest')}
        >
          Pick destination
        </Button>
        <label>
          Option{' '}
          <select
            className="rounded border border-white/20 bg-slate-900 p-2"
            aria-label="Route option"
            value={option}
            onChange={(event) => setOption(event.target.value as 'shortest' | 'accessible')}
          >
            <option value="shortest">Shortest</option>
            <option value="accessible">Accessible</option>
          </select>
        </label>
        <span aria-live="polite" className="text-slate-300">
          {routing
            ? 'Routing…'
            : failure
              ? `Failed: ${failure}`
              : active
                ? `${active.lengthM.toFixed(1)} m · ~${Math.round(active.secondsEta)} s · ${active.instructions[0]}`
                : request
                  ? `No ${option} route is available.`
                  : 'Pick two points'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-3">
        <Button variant="outline" aria-pressed={animated} onClick={() => setAnimated(!animated)}>
          {animated ? 'Pause route effects' : 'Resume route effects'}
        </Button>
        <Button
          disabled={!!playback}
          variant="outline"
          aria-pressed={topDown}
          onClick={() => setTopDown(!topDown)}
        >
          {topDown ? 'Isometric view' : 'Top view'}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            seedRequest(true);
          }}
        >
          Route near booths
        </Button>
        <Button variant="outline" onClick={() => setEdit((value) => value + 1)}>
          {edit % 3 === 0 ? 'Move planter' : edit % 3 === 1 ? 'Remove planter' : 'Restore planter'}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          Walked preview{' '}
          <input
            aria-label="Walked preview"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={progress}
            onChange={(event) => setProgress(Number(event.target.value))}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-sm">
        <label>
          Scenario{' '}
          <select
            disabled={!!playback}
            aria-label="Preview scenario"
            className="rounded border border-white/20 bg-slate-900 p-2"
            value={scenario}
            onChange={(event) => {
              setScenario(event.target.value as Scenario);
              setFloorIndex(0);
              setOption('shortest');
            }}
          >
            <option value="hall">Hall</option>
            <option value="stairs">Stairs between floors</option>
            <option value="ramp">Ramp between floors</option>
            <option value="escalator">Escalator between floors</option>
            <option value="elevator">Elevator between floors</option>
            <option value="restricted">Restricted-zone detour</option>
            <option value="performance">Performance · 300 items</option>
          </select>
        </label>
        {document.floors.map((item, index) => (
          <Button
            key={item.source.id}
            size="sm"
            variant={floorIndex === index ? 'default' : 'outline'}
            onClick={() => setFloorIndex(index)}
          >
            {item.source.name}
          </Button>
        ))}
        <span>{floor.objects.length} inventory items</span>
      </div>
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1" aria-label="Routing debug view">
          <Canvas
            key={topDown ? 'top' : 'iso'}
            frameloop="demand"
            shadows
            dpr={[1, 1.5]}
            camera={{
              position: topDown
                ? [0, 23, 0.001]
                : scenario === 'performance'
                  ? [0, 85, 55]
                  : [0, 16, 10],
              fov: 45,
              near: 0.1,
              far: 200,
            }}
          >
            {playback ? (
              <GameScene
                document={document}
                floorId={floor.source.id}
                originY={-floor.source.heightOffset}
                zones={zones}
              />
            ) : (
              <>
                <color attach="background" args={['#D8DFDD']} />
                <ambientLight intensity={0.6} />
                <directionalLight position={[4, 12, 6]} intensity={2} />
              </>
            )}
            {topDown && (
              <OrthographicCamera
                makeDefault
                position={[0, 22, 0.001]}
                zoom={scenario === 'performance' ? 5 : 25}
                near={0.1}
                far={200}
                onUpdate={(camera) => camera.lookAt(0, 0, 0)}
              />
            )}
            <PlaybackMotionProvider>
              <FloorTap onPick={pick} />
              {floor.objects
                .filter((object) => !(active && object.recipe === 'avatar'))
                .map((object) => (
                  <ProceduralObject
                    key={object.id}
                    object={object}
                    color={object.color}
                    topDown={topDown}
                    windSway={false}
                    routeCutaway={ghostIds.has(object.id)}
                  />
                ))}
              {input.obstacles.map((polygon, index) => (
                <Line
                  key={index}
                  points={[
                    ...polygon.map(([x, z]): [number, number, number] => [x, 0.03, z]),
                    [polygon[0]![0], 0.03, polygon[0]![1]],
                  ]}
                  color="#ff5c6a"
                  lineWidth={2}
                />
              ))}
              {input.islands.map((point, index) => (
                <mesh key={`island-${index}`} position={[point[0], 0.1, point[1]]}>
                  <sphereGeometry args={[0.2, 10, 8]} />
                  <meshBasicMaterial color="#F43F5E" toneMapped={false} />
                </mesh>
              ))}
              <RouteVisuals
                route={active}
                document={document}
                floorId={floor.source.id}
                animated={animated}
                progress={progress}
                topDown={topDown}
              />
              <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.02} />
              <ViewportCameraPersistence
                viewport="preview"
                floorId={`${document.baseline.buildingId}:${floor.source.id}:${topDown ? 'top' : 'orbit'}`}
                enabled={!playback}
              />
              <WalkthroughLayer
                document={document}
                floorId={floor.source.id}
                originY={-floor.source.heightOffset}
                onFloor={(id) => {
                  const index = document.floors.findIndex((item) => item.source.id === id);
                  if (index >= 0) {
                    setFloorIndex(index);
                  }
                }}
              />
            </PlaybackMotionProvider>
          </Canvas>
          <Minimap floor={floor} zones={zones} />
        </div>
        <aside className="w-72 shrink-0 space-y-6 overflow-y-auto border-l border-white/10 p-4">
          <details>
            <summary className="cursor-pointer text-sm">Choose inventory endpoints</summary>
            <RoutePicker
              document={document}
              floorId={floor.source.id}
              tool={
                picking === 'start' ? 'route-start' : picking === 'dest' ? 'route-dest' : 'select'
              }
              setTool={(tool) =>
                setPicking(tool === 'route-start' ? 'start' : tool === 'route-dest' ? 'dest' : null)
              }
              selectionId={null}
            />
          </details>
          <RouteCard
            document={document}
            setFloor={(id) => {
              const index = document.floors.findIndex((item) => item.source.id === id);
              if (index >= 0) {
                setFloorIndex(index);
              }
            }}
            clear={() => useWayfindingStore.getState().clear()}
          />
        </aside>
        <PlaybackHUD document={document} lightingControls={true} />
      </div>
      {cameraAudit && (
        <output className="bg-slate-900 px-5 py-1 text-xs text-emerald-300">
          Editor camera restored · position Δ {cameraAudit.positionError.toExponential(1)} m ·
          rotation Δ {cameraAudit.rotationError.toExponential(1)} rad
        </output>
      )}
      <footer className="border-t border-white/10 px-5 py-3 text-sm text-slate-400">
        Obstacle outlines red · island warnings red spheres · blue = shortest · green = accessible ·
        Other-floor segments are faint · scenario data stays local
      </footer>
    </main>
  );
}
