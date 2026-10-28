import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import {
  CanvasTexture,
  CatmullRomCurve3,
  DoubleSide,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  Vector2,
  LatheGeometry,
  TubeGeometry,
  type Group,
} from 'three';
import { WATER_ACCESSIBLE_HEIGHT, WATER_BASIN_HEIGHT, waterApproachNode } from '../model/water.ts';
import type { PlanObject } from '../model/types.ts';
import { useServiceMotion } from './use-service-motion.ts';

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
  const near: boolean = true;
  const { animate, visible, invalidate } = useServiceMotion(
    !ghost && !topDown,
    root,
    Math.max(w, h, d),
  );
  const flow = useRef(0);
  const droplet = useDropletBadge();
  const jetMap = useJetTexture();
  const count = useBottleCount();
  useFrame((_, delta) => {
    if (animate && visible.current && jetMap) {
      flow.current += Math.min(delta, 0.05);
      jetMap.offset.y = (-1.2 * flow.current) % 1;
      invalidate();
    }
  });
  // The two 0.4 m basins need 0.75 m across; fit legacy footprints explicitly.
  // New catalog default is 0.8 × 1.2 × 0.7 m; vertical accessibility heights stay fixed.
  const sx = w / 0.8,
    sz = d / 0.7;
  const bowl = useMemo(() => {
    const profile = [
      [0.001, -0.15],
      [0.12, -0.15],
      [0.175, -0.11],
      [0.2, -0.025],
      [0.2, 0],
      [0.192, 0],
      [0.165, -0.1],
      [0.11, -0.13],
      [0.001, -0.13],
    ].map(([x, y]) => new Vector2(x!, y!));
    return new LatheGeometry(profile, 24);
  }, []);
  useEffect(() => () => bowl.dispose(), [bowl]);
  const jetCurves = useMemo(
    () =>
      [WATER_BASIN_HEIGHT, WATER_ACCESSIBLE_HEIGHT].map(
        (height) =>
          new CatmullRomCurve3([
            new Vector3(0, height + 0.03, 0),
            new Vector3(0, height + 0.1, 0.06),
            new Vector3(0, height - 0.1, 0.12),
          ]),
      ),
    [],
  );
  const jetGeometries = useMemo(
    () =>
      jetCurves.map((curve) => {
        const geometry = new TubeGeometry(curve, 12, 0.004, 6);
        const uv = geometry.getAttribute('uv');
        // Three's TubeGeometry U follows the path, V circles the tube. Map V to length
        // so the required vertical texture scroll travels along the jet, not around it.
        for (let i = 0; i < uv.count; i++) {
          const along = uv.getX(i);
          uv.setXY(i, uv.getY(i), along);
        }
        return geometry;
      }),
    [jetCurves],
  );
  useEffect(() => () => jetGeometries.forEach((geometry) => geometry.dispose()), [jetGeometries]);
  const steel = {
    color: '#C0C4C8',
    roughness: 0.25,
    metalness: 0.85,
    transparent: ghost,
    opacity: ghost ? 0.45 : 1,
  };
  const approach = waterApproachNode();
  if (!near && !topDown) {
    return (
      <group ref={root} name="WaterFar" scale={[sx, 1, sz]}>
        <mesh position={[-0.175, h / 2, -0.125]} castShadow>
          <boxGeometry args={[0.4, h, 0.4]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        {[WATER_BASIN_HEIGHT, WATER_ACCESSIBLE_HEIGHT].map((height, index) => (
          <mesh key={height} position={[index ? 0.175 : -0.175, height - 0.075, 0.1]}>
            <boxGeometry args={[0.4, 0.15, 0.45]} />
            <meshStandardMaterial {...steel} />
          </mesh>
        ))}
        {!ghost && droplet && (
          <mesh position={[-0.175, 0.35, 0.078]}>
            <planeGeometry args={[0.2, 0.2]} />
            <meshBasicMaterial map={droplet} toneMapped={false} transparent />
          </mesh>
        )}
      </group>
    );
  }
  return (
    <group ref={root} name="WaterStation">
      <group scale={[sx, 1, sz]}>
        {/* Split pedestal makes a real recessed refill alcove, not a decal on a solid box. */}
        <mesh position={[-0.175, 0.375, -0.125]} castShadow receiveShadow>
          <boxGeometry args={[0.4, 0.75, 0.4]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        <mesh position={[-0.175, (h + 0.75) / 2, -0.275]} castShadow>
          <boxGeometry args={[0.4, h - 0.75, 0.1]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        {[-0.35, 0].map((x) => (
          <mesh key={x} position={[x, (h + 0.75) / 2, -0.075]} castShadow>
            <boxGeometry args={[0.05, h - 0.75, 0.3]} />
            <meshStandardMaterial {...steel} />
          </mesh>
        ))}
        <mesh position={[-0.175, h - 0.025, -0.075]} castShadow>
          <boxGeometry args={[0.3, 0.05, 0.3]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        <mesh position={[-0.175, (h + 0.75) / 2, -0.222]}>
          <planeGeometry args={[0.3, Math.max(0.1, h - 0.8)]} />
          <meshStandardMaterial
            color="#1E2022"
            roughness={0.6}
            transparent={ghost}
            opacity={steel.opacity}
          />
        </mesh>
        <mesh position={[-0.175, h - 0.075, -0.064]}>
          <boxGeometry args={[0.05, 0.03, 0.01]} />
          <meshBasicMaterial color="#FF4444" toneMapped={false} />
        </mesh>
        <mesh position={[-0.175, h - 0.08, -0.15]}>
          <cylinderGeometry args={[0.012, 0.012, 0.06, 8]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        <mesh position={[0, WATER_ACCESSIBLE_HEIGHT - 0.17, -0.07]} castShadow>
          <boxGeometry args={[0.4, 0.08, 0.12]} />
          <meshStandardMaterial {...steel} />
        </mesh>
        {[WATER_BASIN_HEIGHT, WATER_ACCESSIBLE_HEIGHT].map((height, index) => (
          <group key={height} position={[index ? 0.175 : -0.175, 0, 0.1]}>
            <mesh position={[0, height, 0]} scale={[1, 1, 1.125]} castShadow receiveShadow>
              <primitive object={bowl} attach="geometry" />
              <meshStandardMaterial {...steel} side={DoubleSide} />
            </mesh>
            {near && (
              <>
                <mesh position={[0, height + 0.02, -0.12]}>
                  <torusGeometry args={[0.03, 0.008, 8, 12, Math.PI]} />
                  <meshStandardMaterial {...steel} />
                </mesh>
                {/* Separate slats have actual gaps, above the open basin floor. */}
                {Array.from({ length: 8 }, (_, i) => (
                  <mesh key={i} position={[-0.118 + i * 0.0337, height - 0.075, 0]}>
                    <boxGeometry args={[0.014, 0.01, 0.2]} />
                    <meshStandardMaterial {...steel} />
                  </mesh>
                ))}
                {!ghost && (
                  <mesh position={[0, 0, -0.12]}>
                    <primitive object={jetGeometries[index]!} attach="geometry" />
                    <meshPhysicalMaterial
                      color="#06B6D4"
                      roughness={0.05}
                      transmission={0.9}
                      thickness={0.008}
                      ior={1.333}
                      map={jetMap ?? undefined}
                    />
                  </mesh>
                )}
              </>
            )}
            <mesh position={[0, height - 0.17, -0.07]} castShadow>
              <boxGeometry args={[0.12, 0.08, 0.25]} />
              <meshStandardMaterial {...steel} />
            </mesh>
          </group>
        ))}
        {!ghost && count && near && (
          <mesh position={[-0.175, 0.62, 0.077]}>
            <planeGeometry args={[0.25, 0.065]} />
            <meshBasicMaterial map={count} toneMapped={false} />
          </mesh>
        )}
        {!ghost && droplet && (
          <mesh position={[-0.175, 0.35, 0.078]}>
            <circleGeometry args={[0.09, 20]} />
            <meshBasicMaterial map={droplet} toneMapped={false} transparent />
          </mesh>
        )}
        {!ghost && near && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.175, 0.005, 0.22]}>
            <circleGeometry args={[0.1, 16]} />
            <meshPhysicalMaterial
              color="#C1E8F0"
              roughness={0.05}
              transmission={0.9}
              thickness={0.002}
              ior={1.333}
            />
          </mesh>
        )}
      </group>
      {topDown && (
        <>
          <Line
            points={[
              [-w / 2, h + 0.02, -d / 2],
              [w / 2, h + 0.02, -d / 2],
              [w / 2, h + 0.02, d / 2],
              [-w / 2, h + 0.02, d / 2],
              [-w / 2, h + 0.02, -d / 2],
            ]}
            color="#C0C4C8"
            lineWidth={2}
          />
          {droplet && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, h + 0.03, 0]}>
              <circleGeometry args={[Math.min(w, d) / 2 - 0.05, 20]} />
              <meshBasicMaterial map={droplet} toneMapped={false} transparent />
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
