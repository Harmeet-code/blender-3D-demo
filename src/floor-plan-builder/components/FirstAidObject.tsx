import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import {
  CanvasTexture,
  DoubleSide,
  SRGBColorSpace,
  Vector3,
  type Group,
  type MeshStandardMaterial,
} from 'three';
import { firstAidEntryLocal } from '../model/firstaid.ts';
import type { PlanObject } from '../model/types.ts';
import { useServiceMotion } from './use-service-motion.ts';

export function useGreenCross(size = 256) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    const s = size / 256;
    context.fillStyle = '#10B981';
    context.fillRect(8 * s, 8 * s, 240 * s, 240 * s);
    context.fillStyle = '#FFFFFF';
    context.fillRect(104 * s, 40 * s, 48 * s, 176 * s);
    context.fillRect(40 * s, 104 * s, 176 * s, 48 * s);
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, [size]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

export function FirstAidObject({
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
  const beacon = useRef<MeshStandardMaterial>(null);
  const [near, setNear] = useState(true);
  const world = useMemo(() => new Vector3(), []);
  const pulse = useMemo(() => ({ t: 0 }), []);
  const { animate, visible, invalidate } = useServiceMotion(
    !ghost && near && !topDown,
    root,
    Math.max(w, h + 0.6, d),
  );
  useFrame(({ camera }, delta) => {
    if (root.current) {
      root.current.getWorldPosition(world);
      const distance = camera.position.distanceTo(world);
      const size = Math.max(w, h, d);
      if (near && distance / size > 9) {
        setNear(false);
      } else if (!near && distance / size < 7) {
        setNear(true);
      }
    }
    if (!ghost && beacon.current) {
      if (animate && visible.current) {
        pulse.t += Math.min(delta, 0.05);
        // Spec curve I = 0.3 + 0.6·sin(6t), clamped at zero (never negative).
        beacon.current.emissiveIntensity = Math.max(0, 0.3 + 0.6 * Math.sin(6 * pulse.t));
        invalidate();
      } else {
        beacon.current.emissiveIntensity = 0.6;
      }
    }
  });

  const cross = useGreenCross();
  const opacity = ghost ? 0.45 : 1;
  const panel = { roughness: 0.85, metalness: 0.05 };
  const hw = w / 2;
  const hd = d / 2;
  const doorW = Math.min(0.9, w - 0.4);
  const cotW = Math.min(0.7, hw - 0.3);
  const cotX = hw - 0.05 - cotW / 2 - 0.3;
  const entry = firstAidEntryLocal(object);
  // Elevated sign header: fixed 2.5 m, floating above the roof on tall rooms.
  const towerY = Math.max(2.5, h + 0.35);

  if (!near && !topDown) {
    return (
      <group ref={root} name="FirstAidFar">
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#F8F9FA" {...panel} transparent={ghost} opacity={opacity} />
        </mesh>
        <mesh position={[w / 4, h + 0.075, d / 4]}>
          <cylinderGeometry args={[0.08, 0.08, 0.15, 6]} />
          <meshStandardMaterial
            color="#10B981"
            emissive="#10B981"
            emissiveIntensity={0.6}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
        {!ghost &&
          cross &&
          [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((yaw) => (
            <mesh
              key={yaw}
              position={[Math.sin(yaw) * (w / 2 + 0.005), h - 0.5, Math.cos(yaw) * (d / 2 + 0.005)]}
              rotation={[0, yaw, 0]}
            >
              <planeGeometry args={[0.6, 0.6]} />
              <meshBasicMaterial map={cross} toneMapped={false} />
            </mesh>
          ))}
      </group>
    );
  }

  const crossPlane = (key: string, size: number, at: readonly [number, number, number], yaw = 0) =>
    !ghost &&
    cross && (
      <mesh key={key} position={[...at]} rotation={[0, yaw, 0]}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial map={cross} toneMapped={false} transparent />
      </mesh>
    );

  return (
    <group ref={root} name="FirstAidStation">
      {[-1, 1].map((side) => (
        <mesh
          key={`side-${side}`}
          position={[side * (doorW / 2 + (w - doorW) / 4), h / 2, hd - 0.02]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[(w - doorW) / 2, h, 0.04]} />
          <meshStandardMaterial color="#F8F9FA" {...panel} transparent={ghost} opacity={opacity} />
        </mesh>
      ))}
      <mesh position={[0, (h + 1.9) / 2, hd - 0.02]} castShadow>
        <boxGeometry args={[doorW, Math.max(0.05, h - 1.9), 0.04]} />
        <meshStandardMaterial color="#F8F9FA" {...panel} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[0, h / 2, -hd + 0.02]} castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.04]} />
        <meshStandardMaterial color="#F8F9FA" {...panel} transparent={ghost} opacity={opacity} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`wall-${side}`}
          position={[side * (hw - 0.02), h / 2, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.04, h, d]} />
          <meshStandardMaterial color="#F8F9FA" {...panel} transparent={ghost} opacity={opacity} />
        </mesh>
      ))}
      <mesh
        userData={{ routeOccluder: true }}
        position={[0, h - 0.025, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[w, 0.05, d]} />
        <meshStandardMaterial color="#F8F9FA" {...panel} transparent={ghost} opacity={opacity} />
      </mesh>
      <group name="EntryDoor" position={[-doorW / 2 + 0.02, 0, hd]}>
        {/* Four opaque pieces surround a real 0.4 × 0.5 m opening. */}
        {[
          [doorW / 2 - 0.02, 0.55, doorW - 0.04, 1.1],
          [doorW / 2 - 0.02, 1.75, doorW - 0.04, 0.3],
          [(doorW - 0.44) / 4, 1.35, (doorW - 0.44) / 2, 0.5],
          [doorW - 0.04 - (doorW - 0.44) / 4, 1.35, (doorW - 0.44) / 2, 0.5],
        ].map(([x, y, width, height], index) => (
          <mesh key={index} position={[x!, y!, 0]} castShadow>
            <boxGeometry args={[width!, height!, 0.04]} />
            <meshStandardMaterial
              color="#E7ECEF"
              roughness={0.7}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
        ))}
        <mesh position={[doorW / 2 - 0.02, 1.35, 0]}>
          <boxGeometry args={[0.4, 0.5, 0.01]} />
          <meshPhysicalMaterial
            color="#F8F9FA"
            roughness={0.05}
            transmission={ghost ? 0 : 0.9}
            thickness={0.01}
            transparent
            opacity={opacity}
            side={DoubleSide}
          />
        </mesh>
        {near && (
          <>
            <mesh position={[doorW - 0.16, 1.0, 0.045]} rotation={[0, 0, -0.15]}>
              <boxGeometry args={[0.12, 0.025, 0.03]} />
              <meshStandardMaterial
                color="#C0C4C8"
                roughness={0.25}
                metalness={0.85}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
            <mesh position={[doorW / 2 - 0.02, 0.06, 0.025]}>
              <boxGeometry args={[doorW - 0.1, 0.12, 0.01]} />
              <meshStandardMaterial
                color="#9AA2A8"
                roughness={0.4}
                metalness={0.7}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
          </>
        )}
      </group>
      <group name="InteriorHint" position={[0.3, 0, 0]}>
        <mesh position={[cotX, 0.39, 0]} castShadow>
          <boxGeometry args={[cotW, 0.12, Math.min(1.8, d - 0.12)]} />
          <meshStandardMaterial
            color="#DDE4E8"
            roughness={0.8}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
        {[-1, 1].map((sideX) =>
          [-1, 1].map((side) => (
            <mesh
              key={`${sideX}:${side}`}
              position={[
                cotX + sideX * (cotW / 2 - 0.05),
                0.165,
                side * (Math.min(1.8, d - 0.12) / 2 - 0.08),
              ]}
            >
              <boxGeometry args={[0.06, 0.33, 0.06]} />
              <meshStandardMaterial
                color="#84929B"
                roughness={0.5}
                metalness={0.6}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
          )),
        )}
        <mesh position={[-0.3, 0.8, hd - 0.2]}>
          <boxGeometry args={[0.4, 0.6, 0.2]} />
          <meshStandardMaterial
            color="#F8F9FA"
            roughness={0.7}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
        {near &&
          [-0.17, 0.17].flatMap((x) =>
            [-0.07, 0.07].map((z) => (
              <mesh key={`${x}:${z}`} position={[-0.3 + x, 0.25, hd - 0.2 + z]}>
                <boxGeometry args={[0.025, 0.5, 0.025]} />
                <meshStandardMaterial
                  color="#84929B"
                  roughness={0.4}
                  metalness={0.7}
                  transparent={ghost}
                  opacity={opacity}
                />
              </mesh>
            )),
          )}
        {!ghost && cross && (
          <mesh position={[-0.3, 0.8, hd - 0.095]}>
            <planeGeometry args={[0.2, 0.2]} />
            <meshBasicMaterial map={cross} toneMapped={false} transparent />
          </mesh>
        )}
        {!ghost && near && (
          <group name="MedBox" position={[-0.3, 1.22, hd - 0.2]}>
            <mesh position={[0, -0.11, 0]}>
              <boxGeometry args={[0.38, 0.04, 0.25]} />
              <meshStandardMaterial color="#C0C4C8" roughness={0.4} metalness={0.7} />
            </mesh>
            <mesh castShadow>
              <boxGeometry args={[0.25, 0.18, 0.12]} />
              <meshStandardMaterial color="#F8F9FA" roughness={0.6} />
            </mesh>
            <mesh position={[0, 0, 0.062]}>
              <boxGeometry args={[0.14, 0.045, 0.005]} />
              <meshStandardMaterial color="#EF4444" roughness={0.5} />
            </mesh>
            <mesh position={[0, 0, 0.062]}>
              <boxGeometry args={[0.045, 0.14, 0.005]} />
              <meshStandardMaterial color="#EF4444" roughness={0.5} />
            </mesh>
          </group>
        )}
      </group>
      <mesh position={[w / 4, h + 0.075, d / 4]}>
        <cylinderGeometry args={[0.08, 0.1, 0.15, 12]} />
        <meshStandardMaterial
          ref={beacon}
          color="#10B981"
          emissive="#10B981"
          emissiveIntensity={0.6}
          roughness={0.3}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, (h + towerY - 0.2) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, Math.max(0.1, towerY - 0.2 - h), 8]} />
        <meshStandardMaterial
          color="#84929B"
          roughness={0.45}
          metalness={0.85}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      <group name="RoofSignTower" position={[0, towerY, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.8, 0.4, 0.8]} />
          <meshStandardMaterial color="#F8F9FA" {...panel} transparent={ghost} opacity={opacity} />
        </mesh>
        {!ghost &&
          cross &&
          [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((yaw, index) => (
            <mesh
              key={index}
              position={[Math.sin(yaw) * 0.405, 0, Math.cos(yaw) * 0.405]}
              rotation={[0, yaw, 0]}
            >
              <planeGeometry args={[0.5, 0.32]} />
              <meshBasicMaterial map={cross} toneMapped={false} transparent />
            </mesh>
          ))}
      </group>
      {crossPlane('cross-front', Math.min(0.4, (w - doorW) / 2 - 0.08), [
        -(doorW / 2 + (w - doorW) / 4),
        h - 0.5,
        hd + 0.005,
      ])}
      {crossPlane('cross-back', Math.min(0.6, w - 0.6), [0, h - 0.5, -hd - 0.005], Math.PI)}
      {crossPlane('cross-left', Math.min(0.6, d - 0.6), [-hw - 0.005, h - 0.5, 0], -Math.PI / 2)}
      {crossPlane('cross-right', Math.min(0.6, d - 0.6), [hw + 0.005, h - 0.5, 0], Math.PI / 2)}
      {topDown && (
        <>
          <Line
            points={[
              [-hw, 0.1, -hd],
              [hw, 0.1, -hd],
              [hw, 0.1, hd],
              [-hw, 0.1, hd],
              [-hw, 0.1, -hd],
            ]}
            color="#F8F9FA"
            lineWidth={2.5}
            depthTest={false}
          />
          <Line
            points={[
              [-hw + 0.1, 0.1, -hd + 0.1],
              [hw - 0.1, 0.1, -hd + 0.1],
              [hw - 0.1, 0.1, hd - 0.1],
              [-hw + 0.1, 0.1, hd - 0.1],
              [-hw + 0.1, 0.1, -hd + 0.1],
            ]}
            color="#10B981"
            lineWidth={3}
            depthTest={false}
          />
          {cross && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, towerY + 0.21, 0]}>
              <planeGeometry args={[0.6, 0.6]} />
              <meshBasicMaterial map={cross} toneMapped={false} transparent />
            </mesh>
          )}
          <mesh position={[w / 4, h + 0.16, d / 4]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.09, 12]} />
            <meshBasicMaterial color="#10B981" toneMapped={false} side={DoubleSide} />
          </mesh>
          <mesh position={[entry[0], 0.05, entry[1]]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.12, 0.3, 3]} />
            <meshBasicMaterial color="#10B981" toneMapped={false} />
          </mesh>
        </>
      )}
    </group>
  );
}
