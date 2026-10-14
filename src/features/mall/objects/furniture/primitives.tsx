import { useMemo } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import type { ColorRepresentation } from 'three';
import { beveledBox } from '@/features/assets/catalog/beveled-box.ts';

export type FurnitureDetail = 'baseline' | 'low';
export type FurnitureGroupProps = Omit<ThreeElements['group'], 'children'>;

export const furnitureColors = {
  oak: '#815734',
  oakLight: '#b39b80',
  bronze: '#af9061',
  bronzeLight: '#c4ad88',
  sand: '#ddd3bc',
  clay: '#b57557',
  stone: '#efe7d5',
  soil: '#342e24',
  foliage: '#597c49',
  foliageLight: '#91a46f',
  darkMetal: '#353c40',
};

export function assertFurnitureDimensions(
  name: string,
  dimensions: { width: number; depth: number; height: number },
) {
  for (const [axis, value] of Object.entries(dimensions)) {
    if (!Number.isFinite(value) || value < 0.05 || value > 10) {
      throw new RangeError(`${name} ${axis} must be a finite dimension between 0.05m and 10m`);
    }
  }
}

type BoxProps = {
  size: [number, number, number];
  position: [number, number, number];
  color: ColorRepresentation;
  radius?: number;
  roughness?: number;
  metalness?: number;
  detail?: FurnitureDetail;
  castShadow?: boolean;
  receiveShadow?: boolean;
};

/** Reusable, source-authored box with the project's sparse rounded-edge topology. */
export function FurnitureBox({
  size,
  position,
  color,
  radius = 0.025,
  roughness = 0.65,
  metalness = 0,
  detail = 'baseline',
  castShadow = true,
  receiveShadow = true,
}: BoxProps) {
  const [width, height, depth] = size;
  const geometry = useMemo(() => {
    if (radius <= 0) {
      return null;
    }
    const source = beveledBox(
      size,
      Math.min(radius, width / 2, height / 2, depth / 2),
      detail === 'low' ? 1 : 3,
    );
    const attributes = {
      position: (source.getAttribute('position').array as Float32Array).slice(),
      normal: (source.getAttribute('normal').array as Float32Array).slice(),
      uv: (source.getAttribute('uv').array as Float32Array).slice(),
    };
    source.dispose();
    return attributes;
  }, [width, height, depth, radius, detail]);

  return (
    <mesh position={position} castShadow={castShadow} receiveShadow={receiveShadow}>
      {geometry ? (
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[geometry.position, 3]} />
          <bufferAttribute attach="attributes-normal" args={[geometry.normal, 3]} />
          <bufferAttribute attach="attributes-uv" args={[geometry.uv, 2]} />
        </bufferGeometry>
      ) : (
        <boxGeometry args={size} />
      )}
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

export function floorLegPositions(width: number, depth: number, inset = 0.12) {
  return [
    [-width / 2 + inset, -depth / 2 + inset],
    [width / 2 - inset, -depth / 2 + inset],
    [-width / 2 + inset, depth / 2 - inset],
    [width / 2 - inset, depth / 2 - inset],
  ] as const;
}
