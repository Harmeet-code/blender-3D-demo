import { DoubleSide } from 'three';
import type { PlanObject } from '../model/types.ts';

export function ChairMesh({
  at = [0, 0, 0],
  yaw = 0,
  ghost = false,
}: {
  at?: readonly [number, number, number];
  yaw?: number;
  ghost?: boolean;
}) {
  const opacity = ghost ? 0.45 : 1;
  return (
    <group name="Chair" position={[...at]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.45, 0.05, 0.45]} />
        <meshStandardMaterial
          color="#2563EB"
          roughness={0.8}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, 0.65, -0.21]} castShadow>
        <boxGeometry args={[0.45, 0.4, 0.05]} />
        <meshStandardMaterial
          color="#2563EB"
          roughness={0.8}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      {(
        [
          [-0.19, -0.19],
          [0.19, -0.19],
          [-0.19, 0.19],
          [0.19, 0.19],
        ] as [number, number][]
      ).map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, 0.225, z]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.45, 8]} />
          <meshStandardMaterial
            color="#1E2022"
            roughness={0.4}
            metalness={0.8}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
      ))}
    </group>
  );
}

export function ChairObject({
  object,
  color,
  ghost = false,
  topDown = false,
}: {
  object: PlanObject;
  color: string;
  ghost?: boolean;
  topDown?: boolean;
}) {
  void color;
  void object;
  return (
    <group>
      <ChairMesh ghost={ghost} />
      {topDown && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <circleGeometry args={[0.25, 16]} />
          <meshBasicMaterial
            color="#2563EB"
            toneMapped={false}
            transparent
            opacity={0.8}
            side={DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}
