import { DoubleSide } from 'three';
import type { PlanObject } from '../model/types.ts';
import { ProceduralChair, type ChairStyle } from './ProceduralChair.tsx';

export function ChairMesh({
  at = [0, 0, 0],
  yaw = 0,
  ghost = false,
  style = 'plastic-stackable',
  width = 0.5,
  depth = 0.5,
  height = 0.85,
}: {
  at?: readonly [number, number, number];
  yaw?: number;
  ghost?: boolean;
  style?: ChairStyle;
  width?: number;
  depth?: number;
  height?: number;
}) {
  return (
    <group name="Chair" position={[...at]} rotation={[0, yaw, 0]}>
      <ProceduralChair style={style} width={width} depth={depth} height={height} ghost={ghost} />
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
  const [width, height, depth] = object.dimensions;
  const style = object.chairStyle ?? 'plastic-stackable';
  return (
    <group>
      <ChairMesh
        ghost={ghost}
        style={style}
        width={width}
        height={style === 'bar-stool' ? 0.85 : height}
        depth={depth}
      />
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
