import { useEffect, useMemo } from 'react';
import { Shape, Vector2 } from 'three';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import type { Room } from '../../entities/building/model/building-schema.ts';
import { useLayoutStore } from '../../entities/building/model/layout-store.ts';
import { assetProofLayout } from '../../entities/building/model/asset-proof-layout.ts';
import { assembleRoom } from '../../entities/building/model/room-assembly.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';
import { AssetInstance } from '../../entities/asset/ui/AssetInstance.tsx';
import { getAssetCatalog } from '../../entities/asset/model/catalog.ts';
import { placeAddOns } from '../../entities/asset/model/placement.ts';
import { useAssetStatus } from '../../entities/asset/model/asset-status.ts';
function BoothMesh({ room, proof }: { room: Room; proof: boolean }) {
  const selectBooth = useWorldStore((s) => s.selectBooth);
  const selected = useWorldStore((s) => s.selectedBoothId === room.id);
  const addOns = useWorldStore((s) => s.cart[room.id]);
  const assembly = useMemo(() => assembleRoom(room), [room]);
  const shape = useMemo(() => new Shape(room.polygon.map(([x, z]) => new Vector2(x, -z))), [room]);
  const placement = useMemo(
    () => placeAddOns(room, addOns ?? (proof ? ['chair', 'table'] : []), getAssetCatalog()),
    [room, addOns, proof],
  );
  useEffect(() => {
    const warnings = placement.isOk() ? placement.value.warnings : [placement.error];
    const key = `placement:${room.id}`;
    useAssetStatus
      .getState()
      .setStatus(
        key,
        warnings.length
          ? { kind: 'error', message: warnings.map((w) => w.message).join(' ') }
          : null,
      );
    return () => useAssetStatus.getState().setStatus(key, null);
  }, [placement, room.id]);
  return (
    <group
      userData={{ boothId: room.id }}
      onClick={(event) => {
        event.stopPropagation();
        selectBooth(room.id);
      }}
    >
      <mesh rotation-x={-Math.PI / 2} position-y={0.002} receiveShadow>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color={selected ? '#8a6624' : '#274955'} />
      </mesh>
      {assembly.canonical ? (
        <AssetInstance
          id={room.boothAssetRef?.id ?? 'booth-frame'}
          version={room.boothAssetRef?.version}
          position={assembly.center}
          yawRadians={assembly.entrance.yawRadians}
          collidable
          boothId={room.id}
        />
      ) : (
        assembly.panels.map((panel, index) => (
          <AssetInstance
            key={index}
            id="wall-panel"
            position={panel.position}
            yawRadians={panel.yawRadians}
            scale={[panel.width, 1, 1]}
            collidable
            boothId={room.id}
          />
        ))
      )}
      {placement.isOk() && (
        <group position={placement.value.origin}>
          {placement.value.records.map((record) => (
            <AssetInstance
              key={record.id}
              id={record.assetId}
              version={record.version}
              position={record.position}
              yawRadians={record.yawRadians}
              collidable
              boothId={room.id}
            />
          ))}
        </group>
      )}
    </group>
  );
}
export function FloorStack() {
  const currentFloorId = useWorldStore((s) => s.currentFloorId),
    dollhouse = useWorldStore((s) => s.dollhouse),
    proof = useWorldStore((s) => s.assetProof);
  const savedLayout = useLayoutStore((s) => s.layout);
  const layout = proof ? assetProofLayout : savedLayout;
  useEffect(() => {
    if (!proof) {
      return;
    }
    useWorldStore.setState((state) => ({
      cart: {
        ...state.cart,
        ...Object.fromEntries(
          assetProofLayout.rooms
            .filter((room) => !state.cart[room.id])
            .map((room) => [room.id, ['chair', 'table']]),
        ),
      },
    }));
  }, [proof]);
  return (
    <group>
      {layout.floors.map((floor, index) => {
        if (!dollhouse && floor.id !== currentFloorId) {
          return null;
        }
        const y = dollhouse ? floor.heightOffset + index * 8 : floor.heightOffset;
        return (
          <group key={floor.id} position={[0, y, 0]} userData={{ floorId: floor.id }}>
            <RigidBody type="fixed" colliders={false}>
              <CuboidCollider args={[20, 0.1, 15]} position={[0, -0.1, 0]} />
              <mesh position={[0, -0.103, 0]} receiveShadow>
                <boxGeometry args={[40, 0.2, 30]} />
                <meshStandardMaterial color="#17232b" />
              </mesh>
            </RigidBody>
            {layout.rooms
              .filter((room) => room.floorId === floor.id)
              .map((room) => (
                <BoothMesh key={room.id} room={room} proof={proof} />
              ))}
            {proof && (
              <group position={[-3, 0, 7]}>
                <AssetInstance id="floor-tile" />
                <AssetInstance id="wall-panel" position={[0, 0, -1.9]} />
                <AssetInstance id="chair" position={[-0.75, 0, 0]} />
                <AssetInstance id="chair" position={[0.75, 0, 0]} />
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}
