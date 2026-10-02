import { useEffect, useMemo } from 'react';
import { Shape, Vector2 } from 'three';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { Html } from '@react-three/drei';
import type { Room, Floor } from '../../entities/building/model/building-schema.ts';
import { useActiveLayout } from '../../entities/building/model/active-layout.ts';
import { assembleRoom } from '../../entities/building/model/room-assembly.ts';
import { portalPlacements } from '../../entities/building/model/portal-placement.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';
import { AssetInstance } from '../../entities/asset/ui/AssetInstance.tsx';
import { AssetBatch, type BatchPlacement } from '../../entities/asset/ui/AssetBatch.tsx';
import { getAssetCatalog, resolveAsset } from '../../entities/asset/model/catalog.ts';
import { placeAddOns, placeLogistics } from '../../entities/asset/model/placement.ts';
import { useAssetStatus } from '../../entities/asset/model/asset-status.ts';
import { retainFloor } from '../../entities/asset/model/resource-cache.ts';
import { ADD_ON_VISUALS } from '../../entities/asset/model/add-on-visuals.ts';
const placementCache = new WeakMap<Room, Map<string, ReturnType<typeof placeAddOns>>>();
function acceptedPlacement(room: Room, selected: readonly string[]) {
  const key = [...selected].sort().join('|'),
    cache = placementCache.get(room) ?? new Map();
  const previous = cache.get(key);
  if (previous) {
    return previous;
  }
  const plan = placeAddOns(room, selected, getAssetCatalog());
  if (cache.size > 8) {
    cache.clear();
  }
  cache.set(key, plan);
  placementCache.set(room, cache);
  return plan;
}
function BoothSurface({ room, ceiling = false }: { room: Room; ceiling?: boolean }) {
  const selected = useWorldStore((s) => s.selectedBoothId === room.id),
    select = useWorldStore((s) => s.selectBooth);
  const shape = useMemo(() => new Shape(room.polygon.map(([x, z]) => new Vector2(x, -z))), [room]);
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position-y={ceiling ? 2.58 : 0.002}
      receiveShadow
      userData={{ boothId: room.id }}
      onClick={(event) => {
        event.stopPropagation();
        select(room.id);
      }}
    >
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial
        color={ceiling ? '#bbc4c9' : selected ? '#8a6624' : '#274955'}
        side={ceiling ? 2 : 0}
      />
    </mesh>
  );
}
function FloorContents({
  floor,
  rooms,
  benchmark,
}: {
  floor: Floor;
  rooms: Room[];
  benchmark: boolean;
}) {
  const cart = useWorldStore((s) => s.cart),
    dollhouse = useWorldStore((s) => s.dollhouse),
    logos = useWorldStore((s) => s.logos);
  const showCeilings = useWorldStore((s) => s.showCeilings);
  const layout = useActiveLayout();
  const allRooms = useMemo(
    () => layout.rooms.filter((room) => room.floorId === floor.id),
    [layout, floor.id],
  );
  const serviceIds = useMemo(
    () =>
      rooms
        .flatMap((room) => cart[room.id] ?? [])
        .flatMap((id) => {
          const visual = ADD_ON_VISUALS[id];
          return visual?.kind === 'logistics' ? [visual.assetId] : [];
        }),
    [rooms, cart],
  );
  const logistics = useMemo(
    () => placeLogistics(floor, allRooms, serviceIds, getAssetCatalog()),
    [floor, allRooms, serviceIds],
  );
  useEffect(() => retainFloor(floor.id), [floor.id]);
  const production = useMemo(() => {
    const batches = new Map<string, BatchPlacement[]>(),
      individual: Array<{
        id: string;
        assetId: string;
        version: number;
        placement: BatchPlacement;
        branding: boolean;
      }> = [],
      warnings: string[] = logistics.isOk()
        ? logistics.value.warnings.map((warning) => warning.message)
        : [logistics.error.message];
    const add = (assetId: string, placement: BatchPlacement, version = 1) => {
      const key = `${assetId}@${version}`,
        list = batches.get(key) ?? [];
      list.push(placement);
      batches.set(key, list);
    };
    for (const room of rooms) {
      const assembly = assembleRoom(room),
        selected = cart[room.id] ?? (benchmark ? ['chair', 'table', 'display-case'] : []);
      const reference = room.boothAssetRef;
      if (
        !assembly.canonical &&
        reference &&
        resolveAsset(reference.id, reference.version).isErr()
      ) {
        warnings.push(
          `${room.id}: Unknown asset ${reference.id}@${reference.version}; polygon preview retained.`,
        );
      } else if (assembly.canonical) {
        if (selected.includes('logo-banner')) {
          individual.push({
            id: `${room.id}:frame`,
            assetId: room.boothAssetRef?.id ?? 'booth-frame',
            version: room.boothAssetRef?.version ?? 1,
            placement: {
              id: `${room.id}:frame`,
              boothId: room.id,
              position: assembly.center,
              yawRadians: assembly.entrance.yawRadians,
            },
            branding: true,
          });
        } else {
          add(
            room.boothAssetRef?.id ?? 'booth-frame',
            {
              id: `${room.id}:frame`,
              boothId: room.id,
              position: assembly.center,
              yawRadians: assembly.entrance.yawRadians,
            },
            room.boothAssetRef?.version ?? 1,
          );
        }
      } else {
        assembly.panels.forEach((panel, index) =>
          add('wall-panel', {
            id: `${room.id}:wall:${index}`,
            boothId: room.id,
            position: panel.position,
            yawRadians: panel.yawRadians,
            scale: [panel.width, 1, 1],
          }),
        );
      }
      const placed = acceptedPlacement(
        room,
        assembly.canonical ? selected.filter((id) => id !== 'logo-banner') : selected,
      );
      if (placed.isErr()) {
        warnings.push(placed.error.message);
        continue;
      }
      warnings.push(...placed.value.warnings.map((w) => `${room.id}: ${w.message}`));
      for (const record of placed.value.records) {
        const placement = {
          id: record.id,
          boothId: room.id,
          position: [
            record.position[0] + placed.value.origin[0],
            0,
            record.position[2] + placed.value.origin[2],
          ] as [number, number, number],
          yawRadians: record.yawRadians,
        };
        if (record.addOnId === 'logo-banner') {
          individual.push({
            id: record.id,
            assetId: record.assetId,
            version: record.version,
            placement,
            branding: true,
          });
        } else {
          add(record.assetId, placement, record.version);
        }
      }
      for (const selectedId of selected) {
        const visual = ADD_ON_VISUALS[selectedId];
        if (
          visual?.kind === 'logistics' &&
          !floor.logisticsAnchors?.some((a) => a.assetId === visual.assetId)
        ) {
          warnings.push(
            `${room.id}: ${visual.assetId} service stays selected; no designated preview area.`,
          );
        }
      }
    }
    return { batches, individual, warnings };
  }, [rooms, cart, floor, benchmark, logistics]);
  useEffect(() => {
    const key = `placement:${floor.id}`;
    useAssetStatus
      .getState()
      .setStatus(
        key,
        production.warnings.length
          ? { kind: 'error', message: production.warnings.join(' ') }
          : null,
      );
    return () => useAssetStatus.getState().setStatus(key, null);
  }, [production, floor.id]);
  return (
    <>
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <boxGeometry args={[40, 0.2, 30]} />
        <meshStandardMaterial color="#17232b" />
      </mesh>
      {!dollhouse && (
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[20, 0.1, 15]} position={[0, -0.1, 0]} />
        </RigidBody>
      )}
      {rooms.map((room) => (
        <BoothSurface key={room.id} room={room} />
      ))}
      {showCeilings &&
        rooms.map((room) => {
          const assembly = assembleRoom(room);
          return assembly.canonical ? (
            <AssetInstance
              key={`ceiling:${room.id}`}
              id="booth-ceiling"
              position={[assembly.center[0], 2.5, assembly.center[2]]}
              yawRadians={assembly.entrance.yawRadians}
              boothId={room.id}
            />
          ) : (
            <BoothSurface key={`ceiling:${room.id}`} room={room} ceiling />
          );
        })}
      {[...production.batches].map(([key, placements]) => {
        const [id = '', version = '1'] = key.split('@');
        return (
          <AssetBatch
            key={key}
            id={id}
            version={Number(version)}
            placements={placements}
            floorId={floor.id}
            physics={!dollhouse}
          />
        );
      })}
      {production.individual.map((item) => (
        <AssetInstance
          key={item.id}
          id={item.assetId}
          version={item.version}
          position={item.placement.position}
          yawRadians={item.placement.yawRadians}
          boothId={item.placement.boothId}
          placementId={item.id}
          collidable
          logo={item.placement.boothId ? logos[item.placement.boothId] : undefined}
        />
      ))}
      {(logistics.isOk() ? logistics.value.anchors : []).map((anchor) => (
        <group key={anchor.id}>
          <AssetInstance
            id={anchor.assetId}
            position={[anchor.position[0], 0, anchor.position[1]]}
            yawRadians={anchor.yawRadians}
            placementId={`service:${floor.id}:${anchor.id}`}
            collidable
          />
          <Html
            position={[anchor.position[0], 2.4, anchor.position[1]]}
            center
            style={{ pointerEvents: 'none' }}
          >
            <span className="rounded bg-black/80 px-2 py-1 text-xs whitespace-nowrap text-white">
              {anchor.assetId} service preview
            </span>
          </Html>
        </group>
      ))}
    </>
  );
}
export function FloorStack() {
  const layout = useActiveLayout(),
    currentFloorId = useWorldStore((s) => s.currentFloorId),
    dollhouse = useWorldStore((s) => s.dollhouse);
  const proof = useWorldStore((s) => s.assetProof),
    stress = useWorldStore((s) => s.stressPreview);
  const portalPlan = useMemo(() => portalPlacements(layout), [layout]);
  useEffect(() => {
    if (!layout.floors.some((floor) => floor.id === currentFloorId)) {
      const first = layout.floors[0];
      if (first) {
        useWorldStore.getState().setCurrentFloor(first.id);
      }
    }
  }, [layout, currentFloorId]);
  const floorRooms = useMemo(
    () =>
      new Map(
        layout.floors.map((floor) => [
          floor.id,
          layout.rooms.filter((room) => room.floorId === floor.id && room.type === 'booth'),
        ]),
      ),
    [layout],
  );
  const doorsOpen = useWorldStore((s) => s.previewDoorsOpen);
  const galleryAssetId = useWorldStore((s) => s.galleryAssetId);
  useEffect(() => {
    if (!proof && !stress) {
      return;
    }
    useWorldStore.setState((state) => ({
      cart: {
        ...state.cart,
        ...Object.fromEntries(
          layout.rooms
            .filter((room) => !state.cart[room.id])
            .map((room) => [
              room.id,
              stress ? ['chair', 'table', 'display-case'] : ['chair', 'table'],
            ]),
        ),
      },
    }));
  }, [layout, proof, stress]);
  useEffect(() => {
    useAssetStatus
      .getState()
      .setStatus(
        'portals',
        portalPlan.warnings.length
          ? { kind: 'error', message: portalPlan.warnings.join(' ') }
          : null,
      );
    return () => useAssetStatus.getState().setStatus('portals', null);
  }, [portalPlan]);
  return (
    <group>
      {layout.floors.map((floor, index) => {
        if (!dollhouse && floor.id !== currentFloorId) {
          return null;
        }
        return (
          <group
            key={floor.id}
            position={[0, floor.heightOffset + (dollhouse ? index * 8 : 0), 0]}
            userData={{ floorId: floor.id }}
          >
            <FloorContents
              floor={floor}
              rooms={floorRooms.get(floor.id) ?? []}
              benchmark={stress}
            />
            {portalPlan.records
              .filter(
                (p) =>
                  p.floorId === floor.id ||
                  (!dollhouse &&
                    p.assetId !== 'elevator-entrance' &&
                    layout.portals
                      .find((portal) => portal.id === p.id)
                      ?.connects.includes(floor.id)),
              )
              .map((p) => (
                <AssetInstance
                  key={p.id}
                  id={p.assetId}
                  position={[
                    p.position[0],
                    (layout.floors.find((f) => f.id === p.floorId)?.heightOffset ?? 0) -
                      floor.heightOffset,
                    p.position[2],
                  ]}
                  yawRadians={p.yawRadians}
                  placementId={p.id}
                  doorOpen={doorsOpen}
                />
              ))}
            {proof && !stress && (
              <group position={[-3, 0, 7]}>
                <AssetInstance
                  id={galleryAssetId}
                  position={[-6, 0, 0]}
                  placementId={`catalog-preview:${floor.id}`}
                  doorOpen={doorsOpen}
                />
                <AssetInstance id="floor-tile" />
                <AssetInstance id="wall-panel" position={[0, 0, -1.9]} />
                <AssetInstance
                  id="chair"
                  position={[-0.75, 0, 0]}
                  placementId={`proof-chair-a:${floor.id}`}
                />
                <AssetInstance
                  id="chair"
                  position={[0.75, 0, 0]}
                  placementId={`proof-chair-b:${floor.id}`}
                />
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}
