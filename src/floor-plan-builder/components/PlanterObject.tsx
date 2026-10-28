import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Object3D,
  SRGBColorSpace,
  Vector3,
  type Group,
  type InstancedMesh,
} from 'three';
import { planterCanopyRadius } from '../model/planter.ts';
import type { PlanObject } from '../model/types.ts';

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function useLeafTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.clearRect(0, 0, 64, 64);
    const gradient = context.createRadialGradient(32, 32, 4, 32, 32, 30);
    gradient.addColorStop(0, '#2BD98A');
    gradient.addColorStop(1, '#0B7A4B');
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(32, 32, 26, 18, 0.6, 0, Math.PI * 2);
    context.fill();
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    return value;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function LeafCards({
  center,
  radius,
  seed,
  count,
  ghost,
  map,
}: {
  center: readonly [number, number, number];
  radius: number;
  seed: number;
  count: number;
  ghost: boolean;
  map: CanvasTexture | null;
}) {
  const ref = useRef<InstancedMesh>(null);
  const rows = useMemo(() => {
    const random = mulberry32(seed);
    return Array.from({ length: count }, (_, i) => {
      const u = random() * 2 - 1;
      const angle = random() * Math.PI * 2;
      const shell = Math.sqrt(1 - u * u);
      const rr = radius * (0.55 + 0.45 * random());
      return {
        at: [
          center[0] + shell * Math.cos(angle) * rr,
          center[1] + u * rr * 0.8,
          center[2] + shell * Math.sin(angle) * rr,
        ] as [number, number, number],
        yaw: random() * Math.PI,
        tilt: (random() - 0.5) * 0.9,
        shade: 0.8 + random() * 0.35,
        index: i,
      };
    });
  }, [center, radius, seed, count]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const dummy = new Object3D();
    const tint = new Color();
    rows.forEach((row, index) => {
      dummy.position.set(...row.at);
      dummy.rotation.set(row.tilt, row.yaw, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, tint.set('#10B981').multiplyScalar(row.shade));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
  }, [rows]);
  if (ghost) {
    return null;
  }
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, rows.length)]} castShadow>
      <planeGeometry args={[0.15, 0.15]} />
      <meshStandardMaterial
        map={map ?? undefined}
        alphaTest={0.5}
        side={DoubleSide}
        roughness={0.7}
        metalness={0}
      />
    </instancedMesh>
  );
}

function Blossoms({
  center,
  radius,
  seed,
  ghost,
}: {
  center: readonly [number, number, number];
  radius: number;
  seed: number;
  ghost: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  const rows = useMemo(() => {
    const random = mulberry32(seed + 7);
    return Array.from({ length: 24 }, () => {
      const u = random() * 2 - 1;
      const angle = random() * Math.PI * 2;
      const shell = Math.sqrt(1 - u * u);
      return [
        center[0] + shell * Math.cos(angle) * radius,
        center[1] + u * radius * 0.85,
        center[2] + shell * Math.sin(angle) * radius,
      ] as [number, number, number];
    });
  }, [center, radius, seed]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const dummy = new Object3D();
    rows.forEach((point, index) => {
      dummy.position.set(...point);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [rows]);
  if (ghost) {
    return null;
  }
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, rows.length]} castShadow>
      <sphereGeometry args={[0.03, 8, 6]} />
      <meshStandardMaterial color="#F8F9FA" roughness={0.5} />
    </instancedMesh>
  );
}

export function PlanterObject({
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
  const [w, h, d] = object.dimensions;
  const variant = object.planterVariant;
  const root = useRef<Group>(null);
  const near: boolean = true;

  const leafMap = useLeafTexture();
  const opacity = ghost ? 0.45 : 1;
  const canopyR = planterCanopyRadius(object);
  const canopyY = Math.min(h - 0.2, 0.6 + (h - 0.6) * 0.6);
  const hedge = useMemo(() => {
    if (variant !== 'hedge-box') {
      return null;
    }
    const random = mulberry32(object.planterSeed);
    const geometry = new BoxGeometry(0.75, 0.7, 0.75, 6, 6, 6);
    const position = geometry.attributes.position!;
    const v = new Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      const n = 1 + (random() - 0.5) * 0.12;
      position.setXYZ(i, v.x * n, v.y * n, v.z * n);
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }, [variant, object.planterSeed]);
  useEffect(() => () => hedge?.dispose(), [hedge]);

  if (!near && !topDown) {
    return (
      <group ref={root} name="PlanterFar">
        <mesh position={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[w, 0.6, d]} />
          <meshStandardMaterial
            color="#1E2022"
            roughness={0.6}
            metalness={0.1}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
        <mesh position={[0, 0.6 + canopyR, 0]} castShadow>
          <octahedronGeometry args={[canopyR, 0]} />
          <meshStandardMaterial
            color="#10B981"
            roughness={0.7}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={root} name="FoliagePlanter">
      <group scale={[1, 1, d / w]}>
        <mesh position={[0, 0.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[w / Math.SQRT2, (0.6 + (w - 0.8) * 0.4) / Math.SQRT2, 0.6, 4]} />
          <meshStandardMaterial
            color="#1E2022"
            roughness={0.6}
            metalness={0.1}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
        <mesh position={[0, 0.585, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[w / Math.SQRT2 + 0.02, w / Math.SQRT2 + 0.02, 0.03, 4]} />
          <meshStandardMaterial
            color="#2A3138"
            roughness={0.6}
            metalness={0.1}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.55, 0]} receiveShadow>
        <planeGeometry args={[w - 0.08, d - 0.08]} />
        <meshStandardMaterial
          color="#334155"
          roughness={0.95}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      {variant === 'tall-tree' && (
        <>
          <mesh position={[0, 0.55 + (canopyY - 0.55) / 2, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.04, Math.max(0.1, canopyY - 0.55), 8]} />
            <meshStandardMaterial
              color="#5B3A1E"
              roughness={0.9}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
          <LeafCards
            center={[0, canopyY, 0]}
            radius={canopyR}
            seed={object.planterSeed}
            count={80}
            ghost={ghost}
            map={leafMap}
          />
        </>
      )}
      {variant === 'hedge-box' && hedge && (
        <mesh geometry={hedge} position={[0, 0.6 + 0.35, 0]} castShadow>
          <meshStandardMaterial
            color="#10B981"
            roughness={0.7}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
      )}
      {variant === 'flower-shrub' && (
        <>
          <mesh position={[0, 0.6 + canopyR * 0.7, 0]} castShadow>
            <icosahedronGeometry args={[canopyR, 1]} />
            <meshStandardMaterial
              color="#10B981"
              roughness={0.7}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
          <Blossoms
            center={[0, 0.6 + canopyR * 0.7, 0]}
            radius={canopyR}
            seed={object.planterSeed}
            ghost={ghost}
          />
        </>
      )}
      {topDown && (
        <>
          <Line
            points={[
              [-w / 2, 0.1, -d / 2],
              [w / 2, 0.1, -d / 2],
              [w / 2, 0.1, d / 2],
              [-w / 2, 0.1, d / 2],
              [-w / 2, 0.1, -d / 2],
            ]}
            color="#1E2022"
            lineWidth={2}
          />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
            <circleGeometry args={[canopyR, 16]} />
            <meshBasicMaterial
              color="#10B981"
              toneMapped={false}
              transparent
              opacity={0.85}
              side={DoubleSide}
            />
          </mesh>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return (
              <Line
                key={i}
                points={[
                  [Math.cos(a) * canopyR * 0.3, 0.12, Math.sin(a) * canopyR * 0.3],
                  [Math.cos(a) * canopyR, 0.12, Math.sin(a) * canopyR],
                ]}
                color="#10B981"
                lineWidth={2}
              />
            );
          })}
        </>
      )}
    </group>
  );
}
