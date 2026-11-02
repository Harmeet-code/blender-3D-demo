import { authoredWallBoxes } from '../../../../features/building/model/authored-walls.ts';
import type { PlanFloor } from '../../../model/types.ts';

/** Draws wall solids from the same authored-wall schema decomposition used by collision. */
export function SchemaWallGeometry({ floor }: { floor: PlanFloor }) {
  const walls = floor.source.authoring?.walls ?? [];
  return (
    <group>
      {walls.flatMap((wall) => authoredWallBoxes(wall).map((box, index) => (
        <mesh
          key={`${wall.id}:${index}`}
          position={[box.position[0], floor.source.heightOffset + box.position[1], box.position[2]]}
          rotation={[0, box.yaw, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={box.halfExtents.map((value) => value * 2) as [number, number, number]} />
          <meshStandardMaterial color="#bdc6d1" roughness={0.88} />
        </mesh>
      )))}
    </group>
  );
}
