import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { InstancedMesh } from 'three';
import {
  CatmullRomCurve3,
  CanvasTexture,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from 'three';

export type V3 = [number, number, number];
export const CirculationAppearance = createContext({
  ghost: false,
  tint: undefined as string | undefined,
  near: true,
});
export function Surface({
  color = '#C0C4C8',
  roughness = 0.35,
  metalness = 0.85,
  glass = false,
  map,
  bumpMap,
  emissive,
}: {
  color?: string;
  roughness?: number;
  metalness?: number;
  glass?: boolean;
  map?: CanvasTexture;
  bumpMap?: CanvasTexture;
  emissive?: string;
}) {
  const { ghost, tint, near } = useContext(CirculationAppearance);
  if (glass && near && !ghost && !tint) {
    return (
      <meshPhysicalMaterial
        color="#F8F9FA"
        roughness={0.05}
        transmission={0.92}
        thickness={0.012}
        ior={1.52}
        transparent
        opacity={0.55}
        depthWrite={false}
        side={2}
      />
    );
  }
  return (
    <meshStandardMaterial
      color={tint ?? color}
      roughness={roughness}
      metalness={glass ? 0 : metalness}
      map={map}
      bumpMap={near ? bumpMap : undefined}
      bumpScale={0.0015}
      emissive={emissive}
      emissiveIntensity={emissive ? 1.3 : 0}
      transparent={ghost || glass}
      opacity={ghost ? 0.4 : glass ? 0.18 : 1}
      depthWrite={!ghost && !glass}
      side={glass ? 2 : 0}
    />
  );
}
export function Part({
  size,
  at = [0, 0, 0],
  rotation,
  ...surface
}: { size: V3; at?: V3; rotation?: V3 } & Parameters<typeof Surface>[0]) {
  return (
    <mesh position={at} rotation={rotation} castShadow={!surface.glass} receiveShadow>
      <boxGeometry args={size} />
      <Surface {...surface} />
    </mesh>
  );
}
export function Boxes({
  rows,
  size,
  ...surface
}: { rows: V3[]; size: V3 } & Parameters<typeof Surface>[0]) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const dummy = new Object3D();
    rows.forEach((point, i) => {
      dummy.position.set(...point);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [rows]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, rows.length]} castShadow receiveShadow>
      <boxGeometry args={size} />
      <Surface {...surface} />
    </instancedMesh>
  );
}
export function Rods({
  rows,
  radius,
  color = '#C0C4C8',
}: {
  rows: [V3, V3][];
  radius: number;
  color?: string;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current!,
      dummy = new Object3D(),
      up = new Vector3(0, 1, 0);
    rows.forEach(([a, b], i) => {
      const start = new Vector3(...a),
        end = new Vector3(...b),
        delta = end.clone().sub(start);
      dummy.position.copy(start.add(end).multiplyScalar(0.5));
      dummy.quaternion.setFromUnitVectors(up, delta.clone().normalize());
      dummy.scale.set(1, delta.length(), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [rows]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, rows.length]} castShadow>
      <cylinderGeometry args={[radius, radius, 1, 8]} />
      <Surface color={color} roughness={0.2} metalness={0.9} />
    </instancedMesh>
  );
}
export function Rail({
  points,
  radius = 0.025,
  color,
  map,
  closed = false,
}: {
  points: V3[];
  radius?: number;
  color?: string;
  map?: CanvasTexture;
  closed?: boolean;
}) {
  const curve = useMemo(
    () =>
      new CatmullRomCurve3(
        points.map((p) => new Vector3(...p)),
        closed,
        'centripetal',
      ),
    [points, closed],
  );
  return (
    <mesh castShadow>
      <tubeGeometry args={[curve, Math.max(16, points.length * 8), radius, 8, closed]} />
      <Surface
        color={color}
        roughness={color === '#1E2022' ? 0.9 : 0.2}
        metalness={color === '#1E2022' ? 0 : 0.9}
        map={map}
      />
    </mesh>
  );
}
/** Tiny local raster data; never fetches fonts, images, models, or an environment. */
export function useCirculationTexture(
  kind: 'grip' | 'belt' | 'sign' | 'steps',
  label = '',
  color = '#06B6D4',
) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = kind === 'sign' ? 512 : 64;
    canvas.height = kind === 'sign' ? 256 : 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = kind === 'sign' ? '#111C27' : kind === 'steps' ? '#1E2022' : '#888888';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (kind === 'sign') {
      context.fillStyle = color;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      if (label === 'ACCESS') {
        // Draw the pictogram, avoiding platform-dependent symbol fonts.
        context.strokeStyle = color;
        context.lineWidth = 12;
        context.lineCap = 'round';
        context.beginPath();
        context.arc(220, 155, 47, 0.1, Math.PI * 1.65);
        context.stroke();
        context.beginPath();
        context.arc(235, 50, 16, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.moveTo(235, 85);
        context.lineTo(239, 135);
        context.lineTo(292, 135);
        context.lineTo(315, 179);
        context.moveTo(240, 104);
        context.lineTo(279, 104);
        context.stroke();
      } else {
        context.font = `600 ${label.length > 14 ? 29 : 74}px system-ui, sans-serif`;
        context.fillText(label, 256, 128, 480);
      }
    } else {
      context.strokeStyle = kind === 'steps' ? color : kind === 'belt' ? '#777777' : '#CCCCCC';
      context.lineWidth = 2;
      for (let n = 0; n < 64; n += 8) {
        context.beginPath();
        context.moveTo(0, n);
        context.lineTo(64, n);
        context.stroke();
      }
      if (kind === 'grip') {
        context.strokeStyle = '#555555';
        for (let n = -64; n < 128; n += 16) {
          context.beginPath();
          context.moveTo(n, 0);
          context.lineTo(n + 64, 64);
          context.stroke();
        }
      }
    }
    const value = new CanvasTexture(canvas);
    value.wrapS = value.wrapT = RepeatWrapping;
    if (kind === 'sign' || kind === 'steps') {
      value.colorSpace = SRGBColorSpace;
    } else {
      value.repeat.set(kind === 'belt' ? 8 : 4, kind === 'belt' ? 1 : 8);
    }
    return value;
  }, [kind, label, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}
export function Sign({
  text,
  at,
  flat = false,
  back = false,
  size = [0.6, 0.3],
  color,
}: {
  text: string;
  at: V3;
  flat?: boolean;
  back?: boolean;
  size?: [number, number];
  color?: string;
}) {
  const map = useCirculationTexture('sign', text, color);
  return (
    <mesh position={at} rotation={flat ? [-Math.PI / 2, 0, 0] : back ? [0, Math.PI, 0] : undefined}>
      <planeGeometry args={size} />
      <meshStandardMaterial
        map={map}
        roughness={0.7}
        emissive="#FFFFFF"
        emissiveMap={map}
        emissiveIntensity={0.5}
      />
    </mesh>
  );
}
