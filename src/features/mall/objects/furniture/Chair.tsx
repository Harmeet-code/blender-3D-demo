import { useMemo } from 'react';
import { Quaternion, Vector3 } from 'three';
import { assertFurnitureDimensions, FurnitureBox, furnitureColors } from './primitives.tsx';
import type { FurnitureDetail, FurnitureGroupProps } from './primitives.tsx';

export interface ChairProps extends FurnitureGroupProps {
  /** Overall width in metres. */
  width?: number;
  /** Front-to-back footprint in metres. */
  depth?: number;
  /** Overall height in metres; floor contact remains at local y=0. */
  height?: number;
  frameColor?: string;
  upholsteryColor?: string;
  detail?: FurnitureDetail;
}

/** A compact lounge chair with tapered oak legs, a cushioned seat, and a padded back. */
export function Chair({
  width = 0.7,
  depth = 0.62,
  height = 1.075,
  frameColor = furnitureColors.oak,
  upholsteryColor = furnitureColors.clay,
  detail = 'baseline',
  ...groupProps
}: ChairProps) {
  assertFurnitureDimensions('Chair', { width, depth, height });
  const widthScale = width / 0.7;
  const depthScale = depth / 0.62;
  const heightScale = height / 1.075;
  const seatHeight = 0.48 * heightScale;

  return (
    <group {...groupProps}>
      {[-0.24, 0.24].flatMap((dx) =>
        [-0.22, 0.22].map((dy) => {
          const from: [number, number, number] = [dx * 1.2 * widthScale, 0, -dy * 1.2 * depthScale];
          const to: [number, number, number] = [
            dx * widthScale,
            0.43 * heightScale,
            -dy * depthScale,
          ];
          return (
            <SplayedLeg
              key={`${dx}-${dy}`}
              from={from}
              to={to}
              color={frameColor}
              radius={0.028 * widthScale}
            />
          );
        }),
      )}
      <FurnitureBox
        size={[0.67 * widthScale, 0.17 * heightScale, 0.62 * depthScale]}
        position={[0, seatHeight, 0]}
        color={upholsteryColor}
        radius={0.055 * Math.min(widthScale, heightScale, depthScale)}
        roughness={0.92}
        detail={detail}
      />
      <FurnitureBox
        size={[0.7 * widthScale, 0.55 * heightScale, 0.14 * depthScale]}
        position={[0, 0.8 * heightScale, -0.25 * depthScale]}
        color={upholsteryColor}
        radius={0.05 * Math.min(widthScale, heightScale, depthScale)}
        roughness={0.92}
        detail={detail}
      />
    </group>
  );
}

function SplayedLeg({
  from,
  to,
  color,
  radius,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  radius: number;
}) {
  const { midpoint, quaternion, length } = useMemo(() => {
    const start = new Vector3(...from);
    const end = new Vector3(...to);
    const direction = end.clone().sub(start);
    return {
      midpoint: start.clone().add(end).multiplyScalar(0.5).toArray() as [number, number, number],
      quaternion: new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        direction.clone().normalize(),
      ),
      length: direction.length(),
    };
  }, [from[0], from[1], from[2], to[0], to[1], to[2]]);

  return (
    <mesh position={midpoint} quaternion={quaternion} castShadow receiveShadow>
      <cylinderGeometry args={[radius * 0.88, radius, length, 12]} />
      <meshStandardMaterial color={color} roughness={0.58} />
    </mesh>
  );
}

export default Chair;
