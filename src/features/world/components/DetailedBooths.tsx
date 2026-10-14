import { Suspense, useEffect, useMemo, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ErrorBoundary } from 'react-error-boundary';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { BoxGeometry, MeshStandardMaterial } from 'three';
import { InstanceSpatialIndex } from '@/features/assets/model/instance-spatial-index.ts';
import type { Room } from '@/features/building/model/building-schema.ts';
import { boothPhysical } from '@/features/building/model/booth-physical.ts';
import {
  LoadedBatch,
  PrimitiveBatch,
  type BatchPlacement,
} from '@/features/assets/components/AssetBatch.tsx';
import { partitionPlacements } from '@/features/assets/model/batch-cells.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { useAssetStatus } from '@/features/assets/model/asset-status.ts';
import { useLayoutStore } from '@/features/building/model/layout-store.ts';
import { frameRuntime } from '../model/frame-runtime.ts';

/** The fallback keeps exactly the same collision perimeter and opening as the verified model. */
function ModelFallback({ rooms, failed = false }: { rooms: Room[]; failed?: boolean }) {
  useEffect(() => {
    if (!failed) {
      return;
    }
    const key = `premium:${rooms[0]?.boothModelUrl}`;
    useAssetStatus.getState().setStatus(key, {
      kind: 'error',
      message:
        'Detailed booth model could not load. Its measured walls and entrance are retained. Reload to retry.',
    });
    return () => useAssetStatus.getState().setStatus(key, null);
  }, [rooms, failed]);
  const preview = useMemo(() => {
    const geometry = new BoxGeometry(1, 1, 1);
    geometry.computeBoundingBox();
    const walls: BatchPlacement[] = rooms.flatMap((room) =>
      boothPhysical(room).boxes.map((box, i) => ({
        id: `${room.id}:${i}`,
        boothId: room.id,
        position: box.position,
        yawRadians: box.yaw,
        scale: box.halfExtents.map((n) => n * 2) as [number, number, number],
      })),
    );
    const floors: BatchPlacement[] = rooms.map((room) => {
      const frame = boothPhysical(room).frame!;
      return {
        id: `floor:${room.id}`,
        boothId: room.id,
        position: [frame.center[0], 0.012, frame.center[1]],
        yawRadians: frame.yaw,
        scale: [frame.width, 0.024, frame.depth],
      };
    });
    const panel = new MeshStandardMaterial({ color: '#c7c2b3', roughness: 0.66 });
    const oak = new MeshStandardMaterial({ color: '#895a2e', roughness: 0.58 });
    return {
      geometry,
      walls,
      floors,
      panel,
      oak,
      wallIndex: new InstanceSpatialIndex(geometry.boundingBox!, walls),
      floorIndex: new InstanceSpatialIndex(geometry.boundingBox!, floors),
    };
  }, [rooms]);
  useEffect(
    () => () => {
      preview.geometry.dispose();
      preview.panel.dispose();
      preview.oak.dispose();
    },
    [preview],
  );
  return (
    <group>
      <PrimitiveBatch
        geometry={preview.geometry}
        material={preview.panel}
        placements={preview.walls}
        assetId="premium-booth"
        index={preview.wallIndex}
      />
      <PrimitiveBatch
        geometry={preview.geometry}
        material={preview.oak}
        placements={preview.floors}
        assetId="premium-booth"
        index={preview.floorIndex}
      />
    </group>
  );
}
export function DetailedBooths({ rooms, floorId }: { rooms: Room[]; floorId: string }) {
  const dollhouse = useWorldStore((s) => s.dollhouse);
  const requestedCellSize =
    typeof window === 'undefined'
      ? 0
      : Number(new URLSearchParams(window.location.search).get('batch-cell') ?? 0);
  const [automaticCell, setAutomaticCell] = useState(64);
  const stable = useRef({ desired: 64, since: 0 });
  useEffect(() => () => frameRuntime.release(`batch-cells:${floorId}`), [floorId]);
  useFrame(({ camera, clock }) => {
    if (requestedCellSize) {
      return;
    }
    // Larger overview cells reduce submission; near views retain finer main/shadow culling.
    const floorHeight =
      useLayoutStore.getState().layout.floors.find((f) => f.id === floorId)?.heightOffset ?? 0;
    const height = Math.abs(camera.position.y - floorHeight);
    const desired = height > 65 ? 64 : height > 20 ? 32 : 16;
    if (desired !== stable.current.desired) {
      stable.current = { desired, since: clock.elapsedTime };
    }
    if (desired !== automaticCell) {
      frameRuntime.wake(`batch-cells:${floorId}`, 700);
      if (clock.elapsedTime - stable.current.since > 0.6) {
        setAutomaticCell(desired);
      }
    } else {
      frameRuntime.release(`batch-cells:${floorId}`);
    }
  });
  const cellSize = [16, 32, 64, 128, 256].includes(requestedCellSize)
    ? requestedCellSize
    : automaticCell;
  const models = useMemo(() => {
    const result = new Map<string, { rooms: Room[]; placements: BatchPlacement[] }>();
    for (const room of rooms) {
      const spec = boothPhysical(room);
      if (spec.provider !== 'premium' || !spec.frame || !spec.model) {
        continue;
      }
      const entry = result.get(spec.model.url) ?? { rooms: [], placements: [] };
      entry.rooms.push(room);
      entry.placements.push({
        id: room.id,
        boothId: room.id,
        position: [spec.frame.center[0], 0, spec.frame.center[1]],
        yawRadians: spec.frame.yaw,
      });
      result.set(spec.model.url, entry);
    }
    return [...result].map(([url, entry]) => ({
      url,
      ...entry,
      cells: partitionPlacements(entry.placements, cellSize),
    }));
  }, [rooms, cellSize]);
  return (
    <group>
      {models.map((model) => (
        <group key={model.url}>
          <ErrorBoundary
            resetKeys={[model.url]}
            fallback={<ModelFallback rooms={model.rooms} failed />}
          >
            <Suspense fallback={<ModelFallback rooms={model.rooms} />}>
              {[...model.cells].map(([cell, placements]) => (
                <LoadedBatch
                  key={cell}
                  url={`procedural:booth-${model.rooms[0]!.dimensionsFeet![0]}x${model.rooms[0]!.dimensionsFeet![1]}@1:baseline`}
                  id="premium-booth"
                  statusId={`premium:${floorId}:${model.url}`}
                  placements={placements}
                />
              ))}
            </Suspense>
          </ErrorBoundary>
          {!dollhouse && (
            <RigidBody type="fixed" colliders={false}>
              {model.rooms.flatMap((room) =>
                boothPhysical(room).boxes.map((box, i) => (
                  <CuboidCollider
                    key={`${room.id}:${i}`}
                    args={box.halfExtents}
                    position={box.position}
                    rotation={[0, box.yaw, 0]}
                  />
                )),
              )}
            </RigidBody>
          )}
        </group>
      ))}
    </group>
  );
}
