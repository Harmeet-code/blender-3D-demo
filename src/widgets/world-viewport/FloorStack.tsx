import { demoLayout, type Room } from '../../entities/building/model/building-schema.ts';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

function BoothMesh({ room, yOffset }: { room: Room; yOffset: number }) {
  const selectBooth = useWorldStore((s) => s.selectBooth);
  const selected = useWorldStore((s) => s.selectedBoothId === room.id);
  const [first, second] = room.polygon;
  const [x1 = 0, z1 = 0] = first ?? [0, 0];
  const [x2 = 4] = second ?? [4, 0];
  const width = Math.abs(x2 - x1) || 4;
  const depth = Math.abs(z1 - 4) || 4;
  const centerX = (x1 + x2) / 2;
  const centerZ = 4;

  return (
    <mesh
      position={[centerX, yOffset + 0.5, centerZ]}
      onClick={(e) => {
        e.stopPropagation();
        selectBooth(room.id);
      }}
    >
      <boxGeometry args={[width, 1, depth]} />
      <meshStandardMaterial color={selected ? '#fbbf24' : '#38bdf8'} transparent opacity={0.85} />
    </mesh>
  );
}

export function FloorStack() {
  const currentFloorId = useWorldStore((s) => s.currentFloorId);
  const dollhouse = useWorldStore((s) => s.dollhouse);

  return (
    <group>
      {demoLayout.floors.map((floor, index) => {
        const y = dollhouse ? index * 8 : floor.heightOffset;
        const visible = dollhouse || floor.id === currentFloorId;
        return (
          <group key={floor.id} position={[0, y, 0]} visible={visible}>
            <mesh rotation-x={-Math.PI / 2} receiveShadow>
              <planeGeometry args={[40, 30]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
            {demoLayout.rooms
              .filter((room) => room.floorId === floor.id)
              .map((room) => (
                <BoothMesh key={room.id} room={room} yOffset={0} />
              ))}
          </group>
        );
      })}
    </group>
  );
}
