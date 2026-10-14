import { assertFurnitureDimensions, FurnitureBox, furnitureColors } from './primitives.tsx';
import type { FurnitureDetail, FurnitureGroupProps } from './primitives.tsx';

export interface SofaProps extends FurnitureGroupProps {
  /** Overall width in metres. */
  width?: number;
  /** Front-to-back footprint in metres. */
  depth?: number;
  /** Overall height in metres; floor contact remains at local y=0. */
  height?: number;
  upholsteryColor?: string;
  accentColor?: string;
  plinthColor?: string;
  detail?: FurnitureDetail;
}

/** Three-seat mall lounge sofa with a bronze reveal, separated seat cushions, and loose accents. */
export function Sofa({
  width = 3.24,
  depth = 1.15,
  height = 1.28,
  upholsteryColor = furnitureColors.sand,
  accentColor = furnitureColors.clay,
  plinthColor = furnitureColors.bronze,
  detail = 'baseline',
  ...groupProps
}: SofaProps) {
  assertFurnitureDimensions('Sofa', { width, depth, height });
  const widthScale = width / 3.24;
  const depthScale = depth / 1.15;
  const heightScale = height / 1.28;
  const seatCount = detail === 'low' ? 1 : 3;

  return (
    <group {...groupProps}>
      <FurnitureBox
        size={[2.8 * widthScale, 0.15 * heightScale, 1 * depthScale]}
        position={[0, 0.075 * heightScale, 0]}
        color={plinthColor}
        radius={0.035}
        roughness={0.3}
        metalness={0.55}
        detail={detail}
      />
      <FurnitureBox
        size={[3.15 * widthScale, 0.42 * heightScale, 1.15 * depthScale]}
        position={[0, 0.4 * heightScale, 0]}
        color={upholsteryColor}
        radius={Math.min(depth, height) * 0.16}
        roughness={0.94}
        detail={detail}
      />
      {Array.from({ length: seatCount }, (_, index) => {
        const cushionWidth = (seatCount === 1 ? 2.83 : 0.91) * widthScale;
        const x = seatCount === 1 ? 0 : (index - 1) * 0.96 * widthScale;
        return (
          <FurnitureBox
            key={`seat-${index}`}
            size={[cushionWidth, 0.18 * heightScale, 0.9 * depthScale]}
            position={[x, 0.66 * heightScale, 0.08 * depthScale]}
            color={upholsteryColor}
            radius={0.075 * Math.min(widthScale, depthScale, heightScale)}
            roughness={0.94}
            detail={detail}
          />
        );
      })}
      {Array.from({ length: seatCount }, (_, index) => (
        <FurnitureBox
          key={`back-${index}`}
          size={[
            (seatCount === 1 ? 2.86 : 0.94) * widthScale,
            0.66 * heightScale,
            0.22 * depthScale,
          ]}
          position={[
            seatCount === 1 ? 0 : (index - 1) * 0.96 * widthScale,
            0.95 * heightScale,
            -0.46 * depthScale,
          ]}
          color={upholsteryColor}
          radius={0.09 * Math.min(widthScale, depthScale, heightScale)}
          roughness={0.94}
          detail={detail}
        />
      ))}
      {[-1, 1].map((side) => (
        <FurnitureBox
          key={`arm-${side}`}
          size={[0.22 * widthScale, 0.5 * heightScale, 1.1 * depthScale]}
          position={[side * 1.51 * widthScale, 0.76 * heightScale, 0]}
          color={upholsteryColor}
          radius={0.07 * Math.min(widthScale, heightScale, depthScale)}
          roughness={0.94}
          detail={detail}
        />
      ))}
      {detail === 'baseline' &&
        [-1, 1].map((side) => (
          <FurnitureBox
            key={`accent-${side}`}
            size={[0.43 * widthScale, 0.44 * heightScale, 0.2 * depthScale]}
            position={[side * 0.9 * widthScale, 0.94 * heightScale, -0.18 * depthScale]}
            color={accentColor}
            radius={0.07}
            roughness={0.92}
          />
        ))}
    </group>
  );
}

export default Sofa;
