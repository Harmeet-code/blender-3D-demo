import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import {
  CanvasTexture,
  CatmullRomCurve3,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Group,
  type Mesh,
} from 'three';
import { WATER_ACCESSIBLE_HEIGHT, WATER_BASIN_HEIGHT, waterApproachNode } from '../model/water.ts';
import type { PlanObject } from '../model/types.ts';

export function useDropletBadge(size = 256) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    const s = size / 256;
    context.fillStyle = '#06B6D4';
    context.beginPath();
    context.arc(128 * s, 128 * s, 120 * s, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#FFFFFF';
    context.beginPath();
    context.moveTo(128 * s, 60 * s);
    context.bezierCurveTo(80 * s, 130 * s, 80 * s, 175 * s, 128 * s, 175 * s);
    context.bezierCurveTo(176 * s, 175 * s, 176 * s, 130 * s, 128 * s, 60 * s);
    context.fill();
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, [size]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function useJetTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.fillStyle = '#06B6D4';
    context.fillRect(0, 0, 16, 64);
    context.fillStyle = '#BFF3FF';
    for (let y = 0; y < 64; y += 12) {
      context.fillRect(0, y, 16, 5);
    }
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.wrapS = RepeatWrapping;
    value.wrapT = RepeatWrapping;
    value.repeat.set(1, 3);
    return value;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function useBottleCount() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.fillStyle = '#0A0F0A';
    context.fillRect(0, 0, 256, 64);
    context.fillStyle = '#22FF88';
    context.font = '600 24px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('SAVED: 12,480', 128, 18, 240);
    context.fillText('BOTTLES', 128, 46, 240);
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    return value;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

export function WaterObject({
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
  const root = useRef<Group>(null);
  const jet = useRef<Mesh>(null);
  const [near, setNear] = useState(true);
  const world = useMemo(() => new Vector3(), []);
  const flow = useMemo(() => ({ t: 0 }), []);
  useFrame(({ camera }, delta) => {
    if (root.current) {
      root.current.getWorldPosition(world);
      const distance = camera.position.distanceTo(world);
      const size = Math.max(w, h, d);
      if (near && distance / size > 12) {
        setNear(false);
      } else if (!near && distance / size < 9) {
        setNear(true);
      }
    }
    if (!ghost && jet.current) {
      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced) {
        flow.t += Math.min(delta, 0.05);
        const { map } = jet.current.material as unknown as { map?: { offset: { y: number } } };
        if (map) {
          map.offset.y = (flow.t * -1.2) % 1;
        }
      }
    }
  });

  const droplet = useDropletBadge();
  const jetMap = useJetTexture();
  const count = useBottleCount();
  const opacity = ghost ? 0.45 : 1;
  const steel = { roughness: 0.25, metalness: 0.85 };
  const approach = waterApproachNode();
  const jetCurve = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(-0.1, 1.0, 0.12),
        new Vector3(-0.1, 1.06, 0.2),
        new Vector3(-0.1, 0.98, 0.26),
      ]),
    [],
  );

  if (!near && !topDown) {
    return (
      <group ref={root} name="WaterFar">
        <mesh position={[-0.1, h / 2, 0]} castShadow>
          <boxGeometry args={[0.4, h, 0.4]} />
          <meshStandardMaterial color="#C0C4C8" {...steel} transparent={ghost} opacity={opacity} />
        </mesh>
        {droplet && (
          <mesh position={[0.15, 0.9, 0.21]}>
            <planeGeometry args={[0.2, 0.2]} />
            <meshBasicMaterial map={droplet} toneMapped={false} transparent />
          </mesh>
        )}
      </group>
    );
  }

  return (
    <group ref={root} name="WaterStation">
      <mesh position={[-0.1, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.4, h, 0.4]} />
        <meshStandardMaterial color="#C0C4C8" {...steel} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[-0.1, (0.75 + h) / 2, 0.12]} castShadow>
        <boxGeometry args={[0.3, h - 0.75, 0.16]} />
        <meshStandardMaterial
          color="#1E2022"
          roughness={0.6}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[-0.1, h - 0.015, 0.12]}>
        <boxGeometry args={[0.05, 0.03, 0.01]} />
        <meshBasicMaterial color="#FF4444" toneMapped={false} />
      </mesh>
      <mesh
        position={[-0.1, WATER_BASIN_HEIGHT - 0.075, 0.22]}
        scale={[0.89, 1, 1]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.225, 0.19, 0.15, 20]} />
        <meshStandardMaterial color="#C0C4C8" {...steel} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh
        position={[0.25, WATER_ACCESSIBLE_HEIGHT - 0.075, 0.22]}
        scale={[0.89, 1, 1]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.225, 0.19, 0.15, 20]} />
        <meshStandardMaterial color="#C0C4C8" {...steel} transparent={ghost} opacity={opacity} />
      </mesh>
      {[-0.1, 0.25].map((x, index) => (
        <group key={index}>
          <mesh
            position={[x, (index ? WATER_ACCESSIBLE_HEIGHT : WATER_BASIN_HEIGHT) + 0.02, 0.12]}
            castShadow
          >
            <torusGeometry args={[0.03, 0.008, 8, 12, Math.PI]} />
            <meshStandardMaterial
              color="#C0C4C8"
              {...steel}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
          <mesh
            position={[x, (index ? WATER_ACCESSIBLE_HEIGHT : WATER_BASIN_HEIGHT) - 0.03, 0.22]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.25, 0.2]} />
            <meshStandardMaterial
              color="#5A636B"
              roughness={0.5}
              metalness={0.7}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
        </group>
      ))}
      {!ghost && (
        <mesh ref={jet} castShadow={false}>
          <tubeGeometry args={[jetCurve, 12, 0.004, 6]} />
          <meshStandardMaterial
            color="#06B6D4"
            roughness={0.05}
            transparent
            opacity={0.85}
            map={jetMap ?? undefined}
            depthWrite={false}
          />
        </mesh>
      )}
      {near && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.25, 0.005, 0.45]} receiveShadow>
            <circleGeometry args={[0.1, 16]} />
            <meshStandardMaterial
              color="#9FB3BD"
              roughness={0.05}
              metalness={0.6}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
          {count && (
            <mesh position={[-0.1, 0.62, 0.205]}>
              <planeGeometry args={[0.16, 0.04]} />
              <meshBasicMaterial map={count} toneMapped={false} />
            </mesh>
          )}
        </>
      )}
      {!ghost && droplet && (
        <mesh position={[0.15, 0.9, d / 2 + 0.005]}>
          <circleGeometry args={[0.09, 20]} />
          <meshBasicMaterial map={droplet} toneMapped={false} transparent />
        </mesh>
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
            color="#C0C4C8"
            lineWidth={2}
          />
          {droplet && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, h + 0.01, 0]}>
              <circleGeometry args={[Math.min(w, d) / 2 - 0.05, 20]} />
              <meshBasicMaterial map={droplet} toneMapped={false} transparent opacity={0.95} />
            </mesh>
          )}
          <mesh position={[approach[0], 0.05, approach[1]]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.09, 0.22, 3]} />
            <meshBasicMaterial color="#06B6D4" toneMapped={false} />
          </mesh>
        </>
      )}
    </group>
  );
}
