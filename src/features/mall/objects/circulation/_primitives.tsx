import { useEffect, useMemo } from 'react';
import { BoxGeometry, CatmullRomCurve3, Quaternion, TubeGeometry, Vector3 } from 'three';
import { beveledBox } from '../../../assets/catalog/beveled-box';

export type Point3 = readonly [number, number, number];

export function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number; received ${value}`);
  }
}

export function Box({
  size,
  position,
  color,
  roughness = 0.42,
  metalness = 0.08,
  bevel = 0,
  transparent = false,
  opacity = 1,
  transmission = 0,
}: {
  size: Point3;
  position: Point3;
  color: string;
  roughness?: number;
  metalness?: number;
  bevel?: number;
  transparent?: boolean;
  opacity?: number;
  transmission?: number;
}) {
  size.forEach((value, axis) => assertPositive(`box dimension ${axis}`, value));
  const geometry = useMemo(() => {
    const dimensions: [number, number, number] = [size[0], size[1], size[2]];
    return bevel > 0
      ? beveledBox(dimensions, Math.min(bevel, size[0] / 2, size[1] / 2, size[2] / 2), 2)
      : new BoxGeometry(...dimensions);
  }, [bevel, size[0], size[1], size[2]]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh position={position} castShadow={transmission === 0 && !transparent} receiveShadow>
      <primitive object={geometry} attach="geometry" />
      {transmission > 0 ? (
        <meshPhysicalMaterial
          color={color}
          roughness={roughness}
          metalness={metalness}
          transmission={transmission}
          thickness={0.02}
          ior={1.46}
        />
      ) : (
        <meshStandardMaterial
          color={color}
          roughness={roughness}
          metalness={metalness}
          transparent={transparent}
          opacity={opacity}
          depthWrite={!transparent}
        />
      )}
    </mesh>
  );
}

export function Beam({
  start,
  end,
  radius,
  color,
  roughness = 0.35,
  metalness = 0.45,
}: {
  start: Point3;
  end: Point3;
  radius: number;
  color: string;
  roughness?: number;
  metalness?: number;
}) {
  const direction = new Vector3(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  const position: Point3 = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2,
  ];
  const quaternion = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  return (
    <mesh position={position} quaternion={quaternion} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, direction.length(), 12]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

export function ContinuousBelt({
  length,
  radius,
  color,
}: {
  length: number;
  radius: number;
  color: string;
}) {
  const geometry = useMemo(() => {
    const endCenter = length - 0.24;
    const arcRadius = Math.min(0.34, length / 8);
    const centerY = 0.67;
    const points: Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      points.push(new Vector3(0, centerY + arcRadius, 0.24 + (endCenter - 0.24) * t));
    }
    for (let i = 1; i <= 10; i++) {
      const angle = Math.PI / 2 - (Math.PI * i) / 10;
      points.push(
        new Vector3(
          0,
          centerY + arcRadius * Math.sin(angle),
          endCenter + arcRadius * Math.cos(angle),
        ),
      );
    }
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      points.push(new Vector3(0, centerY - arcRadius, endCenter - (endCenter - 0.24) * t));
    }
    for (let i = 1; i <= 10; i++) {
      const angle = -Math.PI / 2 - (Math.PI * i) / 10;
      points.push(
        new Vector3(0, centerY + arcRadius * Math.sin(angle), 0.24 + arcRadius * Math.cos(angle)),
      );
    }
    return new TubeGeometry(
      new CatmullRomCurve3(points, true, 'centripetal'),
      Math.max(40, Math.ceil(length * 16)),
      radius,
      8,
      true,
    );
  }, [length, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.82} metalness={0.08} />
    </mesh>
  );
}
