import { assertFurnitureDimensions, FurnitureBox, furnitureColors } from './primitives.tsx';
import type { FurnitureDetail, FurnitureGroupProps } from './primitives.tsx';

export interface BenchProps extends FurnitureGroupProps {
  /** Overall width in metres. */
  width?: number;
  /** Front-to-back footprint in metres. */
  depth?: number;
  /** Floor-to-seat height in metres. */
  height?: number;
  woodColor?: string;
  supportColor?: string;
  detail?: FurnitureDetail;
}

/** Public-space bench with separate oak slats and solid limestone feet. */
export function Bench({
  width = 2.25,
  depth = 0.72,
  height = 0.46,
  woodColor = furnitureColors.oak,
  supportColor = furnitureColors.stone,
  detail = 'baseline',
  ...groupProps
}: BenchProps) {
  assertFurnitureDimensions('Bench', { width, depth, height });
  const legWidth = width * 0.075;
  const legDepth = depth * 0.76;
  const slatCount = detail === 'low' ? 3 : 5;
  const gap = depth * 0.025;
  const slatDepth = (depth - gap * (slatCount - 1)) / slatCount;

  return (
    <group {...groupProps}>
      {[-1, 1].map((side) => (
        <FurnitureBox
          key={`stone-foot-${side}`}
          size={[legWidth, height * 0.77, legDepth]}
          position={[side * width * 0.36, height * 0.385, 0]}
          color={supportColor}
          radius={0.025}
          detail={detail}
        />
      ))}
      {Array.from({ length: slatCount }, (_, index) => {
        const z = -depth / 2 + slatDepth / 2 + index * (slatDepth + gap);
        return (
          <FurnitureBox
            key={`oak-slat-${index}`}
            size={[width * 0.96, height * 0.16, slatDepth]}
            position={[0, height * 0.86, z]}
            color={woodColor}
            radius={0.018}
            roughness={0.48}
            detail={detail}
          />
        );
      })}
    </group>
  );
}

export default Bench;
