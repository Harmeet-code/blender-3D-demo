import { assertFurnitureDimensions, furnitureColors } from './primitives.tsx';
import type { FurnitureDetail, FurnitureGroupProps } from './primitives.tsx';
import { Quaternion, Vector3 } from 'three';

export interface TableProps extends FurnitureGroupProps {
  /** Overall tabletop width in metres. */
  width?: number;
  /** Overall tabletop depth in metres. */
  depth?: number;
  /** Floor-to-tabletop height in metres. */
  height?: number;
  topColor?: string;
  baseColor?: string;
  detail?: FurnitureDetail;
}

/** Low lounge table with a thick honed-stone top and a single bronze pedestal. */
export function Table({
  width = 1.24,
  depth = 1.24,
  height = 0.715,
  topColor = furnitureColors.stone,
  baseColor = furnitureColors.bronze,
  detail = 'baseline',
  ...groupProps
}: TableProps) {
  assertFurnitureDimensions('Table', { width, depth, height });
  const widthScale = width / 1.24;
  const depthScale = depth / 1.24;
  const heightScale = height / 0.715;
  const radiusScale = Math.min(widthScale, depthScale);
  const topThickness = 0.09 * heightScale;
  const footHeight = 0.09 * heightScale;
  const shaftHeight = 0.6 * heightScale;

  return (
    <group {...groupProps}>
      <mesh position={[0, footHeight / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry
          args={[0.4 * radiusScale, 0.4 * radiusScale, footHeight, detail === 'low' ? 12 : 28]}
        />
        <meshStandardMaterial color={baseColor} roughness={0.31} metalness={0.62} />
      </mesh>
      <mesh position={[0, 0.33 * heightScale, 0]} castShadow>
        <cylinderGeometry
          args={[0.14 * radiusScale, 0.14 * radiusScale, shaftHeight, detail === 'low' ? 10 : 20]}
        />
        <meshStandardMaterial color={baseColor} roughness={0.28} metalness={0.72} />
      </mesh>
      <mesh
        position={[0, 0.67 * heightScale, 0]}
        scale={[widthScale / radiusScale, 1, depthScale / radiusScale]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry
          args={[0.62 * radiusScale, 0.62 * radiusScale, topThickness, detail === 'low' ? 16 : 40]}
        />
        <meshStandardMaterial color={topColor} roughness={0.4} />
      </mesh>
      <mesh position={[0.13 * widthScale, 0.79 * heightScale, 0]} castShadow>
        <cylinderGeometry
          args={[
            0.065 * widthScale,
            0.065 * widthScale,
            0.18 * heightScale,
            detail === 'low' ? 8 : 16,
          ]}
        />
        <meshStandardMaterial color={furnitureColors.clay} roughness={0.72} />
      </mesh>
      <VaseStem heightScale={heightScale} widthScale={widthScale} />
    </group>
  );
}

function VaseStem({ heightScale, widthScale }: { heightScale: number; widthScale: number }) {
  const start = new Vector3(0.13 * widthScale, 0.84 * heightScale, 0);
  const end = new Vector3(0.15 * widthScale, 1.06 * heightScale, 0);
  const direction = end.clone().sub(start);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const quaternion = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    direction.clone().normalize(),
  );

  return (
    <mesh position={midpoint} quaternion={quaternion}>
      <cylinderGeometry args={[0.012 * widthScale, 0.012 * widthScale, direction.length(), 8]} />
      <meshStandardMaterial color={furnitureColors.foliage} roughness={0.8} />
    </mesh>
  );
}

export default Table;
