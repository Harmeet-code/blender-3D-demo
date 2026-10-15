import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { BufferGeometry } from 'three';
import {
  CanvasTexture,
  CatmullRomCurve3,
  DoubleSide,
  ExtrudeGeometry,
  Shape,
  SRGBColorSpace,
  Vector3,
  type Group,
} from 'three';
import {
  INFO_ACCESSIBLE_HEIGHT,
  INFO_COUNTER_HEIGHT,
  infoCustomerNode,
  infoStaffNode,
} from '../model/information.ts';
import type { PlanObject } from '../model/types.ts';

export function useInfoBadge(size = 256) {
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
    context.arc(128 * s, 70 * s, 16 * s, 0, Math.PI * 2);
    context.fill();
    if (typeof context.roundRect === 'function') {
      context.beginPath();
      context.roundRect(112 * s, 106 * s, 32 * s, 80 * s, 8 * s);
      context.fill();
    } else {
      context.fillRect(112 * s, 106 * s, 32 * s, 80 * s);
    }
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, [size]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

export function InformationObject({
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
  const signY = object.infoSignHeight;
  const root = useRef<Group>(null);
  const [near, setNear] = useState(true);
  const world = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    if (!root.current) {
      return;
    }
    root.current.getWorldPosition(world);
    const distance = camera.position.distanceTo(world);
    const size = Math.max(w, h, d);
    if (near && distance / size > 9) {
      setNear(false);
    } else if (!near && distance / size < 7) {
      setNear(true);
    }
  });

  const badge = useInfoBadge();
  const rack = useMemo(() => {
    const profile = new Shape();
    profile.moveTo(-0.175, 0);
    profile.lineTo(0.175, 0);
    profile.lineTo(0.175, 0.12);
    profile.lineTo(0.05, 0.12);
    profile.lineTo(0.05, 0.24);
    profile.lineTo(-0.07, 0.24);
    profile.lineTo(-0.07, 0.36);
    profile.lineTo(-0.175, 0.36);
    profile.closePath();
    const geometry: BufferGeometry = new ExtrudeGeometry(profile, {
      depth: 0.25,
      bevelEnabled: false,
    });
    geometry.translate(0, 0, -0.125);
    return geometry;
  }, []);
  useEffect(() => () => rack.dispose(), [rack]);
  const lampCurve = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(w / 2 - 0.15, INFO_COUNTER_HEIGHT, -d / 2 + 0.15),
        new Vector3(w / 2 - 0.15, INFO_COUNTER_HEIGHT + 0.45, -d / 2 + 0.15),
        new Vector3(w / 2 - 0.35, INFO_COUNTER_HEIGHT + 0.55, 0.1),
      ]),
    [w, d],
  );
  const opacity = ghost ? 0.45 : 1;
  const dark = { roughness: 0.85, metalness: 0.05 };
  const standingW = Math.min(1.2, w * 0.6);
  const accessW = Math.min(0.8, Math.max(0.4, w - standingW));
  const total = standingW + accessW;
  const standingX = -total / 2 + standingW / 2;
  const accessX = total / 2 - accessW / 2;
  const frontZ = d / 2;
  const counterZ = frontZ - 0.3;
  const customer = infoCustomerNode();
  const staff = infoStaffNode();

  if (!near && !topDown) {
    return (
      <group ref={root} name="InformationFar">
        <mesh position={[(standingX + accessX) / 2, INFO_COUNTER_HEIGHT / 2, counterZ]} castShadow>
          <boxGeometry args={[total, INFO_COUNTER_HEIGHT, 0.6]} />
          <meshStandardMaterial color="#1E2022" {...dark} transparent={ghost} opacity={opacity} />
        </mesh>
        <mesh position={[0, h / 2, -d / 2 + 0.04]} castShadow>
          <boxGeometry args={[w, h, 0.08]} />
          <meshStandardMaterial color="#1E2022" {...dark} transparent={ghost} opacity={opacity} />
        </mesh>
        <mesh position={[0, signY, 0]}>
          <cylinderGeometry args={[0.4, 0.4, 0.4, 12]} />
          <meshStandardMaterial
            color="#06B6D4"
            emissive="#06B6D4"
            emissiveIntensity={0.6}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={root} name="InformationDesk">
      <mesh position={[standingX, INFO_COUNTER_HEIGHT / 2, counterZ]} castShadow receiveShadow>
        <boxGeometry args={[standingW, INFO_COUNTER_HEIGHT, 0.6]} />
        <meshStandardMaterial color="#1E2022" {...dark} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[standingX, INFO_COUNTER_HEIGHT + 0.01, counterZ]} castShadow>
        <boxGeometry args={[standingW + 0.04, 0.04, 0.64]} />
        <meshStandardMaterial
          color="#F8F9FA"
          roughness={0.2}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      {!ghost && near && (
        <mesh position={[standingX, INFO_COUNTER_HEIGHT - 0.015, frontZ + 0.005]}>
          <planeGeometry args={[standingW - 0.1, 0.03]} />
          <meshBasicMaterial color="#E6ECEF" toneMapped={false} transparent opacity={0.9} />
        </mesh>
      )}
      <mesh
        position={[accessX, 0.5 + (INFO_ACCESSIBLE_HEIGHT - 0.5) / 2, counterZ - 0.05]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[accessW, INFO_ACCESSIBLE_HEIGHT - 0.5, 0.5]} />
        <meshStandardMaterial
          color="#06B6D4"
          roughness={0.8}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[accessX, INFO_ACCESSIBLE_HEIGHT + 0.01, counterZ - 0.05]} castShadow>
        <boxGeometry args={[accessW + 0.04, 0.04, 0.54]} />
        <meshStandardMaterial
          color="#F8F9FA"
          roughness={0.2}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[accessX + side * (accessW / 2 - 0.03), 0.25, counterZ - 0.05]}
          castShadow
        >
          <boxGeometry args={[0.06, 0.5, 0.5]} />
          <meshStandardMaterial
            color="#06B6D4"
            roughness={0.8}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.04, counterZ - 0.02]} receiveShadow>
        <boxGeometry args={[total, 0.08, 0.52]} />
        <meshStandardMaterial
          color="#3A4046"
          roughness={0.6}
          metalness={0.4}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, h / 2, -d / 2 + 0.04]} castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.08]} />
        <meshStandardMaterial
          color="#1E2022"
          {...dark}
          transparent={ghost}
          opacity={opacity}
          side={DoubleSide}
        />
      </mesh>
      {!ghost && badge && (
        <mesh name="BackPanelBadge" position={[0, Math.min(1.6, h - 0.4), -d / 2 + 0.085]}>
          <planeGeometry args={[0.9, 0.9]} />
          <meshBasicMaterial map={badge} toneMapped={false} transparent />
        </mesh>
      )}
      <group position={[standingX, INFO_COUNTER_HEIGHT + 0.02, counterZ - 0.1]}>
        <mesh geometry={rack} castShadow>
          <meshPhysicalMaterial
            color="#F8F9FA"
            roughness={0.1}
            transmission={ghost ? 0 : 0.9}
            thickness={0.01}
            transparent
            opacity={ghost ? 0.45 : 0.6}
            depthWrite={false}
            side={DoubleSide}
          />
        </mesh>
        {near &&
          ['#EF4444', '#F59E0B', '#06B6D4'].map((paper, index) => (
            <mesh
              key={paper}
              position={[0, 0.1 + index * 0.12, 0.005 - index * 0.06]}
              rotation={[-0.25, 0, 0]}
            >
              <boxGeometry args={[0.3, 0.09, 0.008]} />
              <meshStandardMaterial
                color={paper}
                roughness={0.9}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
          ))}
      </group>
      <group
        position={[standingX + 0.35, INFO_COUNTER_HEIGHT + 0.02, counterZ + 0.1]}
        rotation={[-Math.PI / 4, 0, 0]}
      >
        <mesh position={[0, 0.1, 0]} castShadow>
          <boxGeometry args={[0.25, 0.2, 0.02]} />
          <meshStandardMaterial
            color="#111C27"
            roughness={0.3}
            metalness={0.4}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
        <mesh position={[0, 0.02, 0.02]}>
          <boxGeometry args={[0.08, 0.04, 0.08]} />
          <meshStandardMaterial
            color="#3A4046"
            roughness={0.5}
            metalness={0.6}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
      </group>
      {near && (
        <group name="DeskLamp">
          <mesh castShadow>
            <tubeGeometry args={[lampCurve, 16, 0.015, 8]} />
            <meshStandardMaterial
              color="#1E2022"
              roughness={0.4}
              metalness={0.7}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
          <mesh position={[w / 2 - 0.35, INFO_COUNTER_HEIGHT + 0.55, 0.1]}>
            <cylinderGeometry args={[0.035, 0.05, 0.09, 10]} />
            <meshStandardMaterial
              color="#1E2022"
              roughness={0.4}
              metalness={0.7}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
          <mesh position={[w / 2 - 0.35, INFO_COUNTER_HEIGHT + 0.51, 0.1]}>
            <sphereGeometry args={[0.025, 8, 6]} />
            <meshBasicMaterial color="#FFF7D6" toneMapped={false} />
          </mesh>
        </group>
      )}
      <mesh position={[0, (h + signY - 0.2) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, Math.max(0.1, signY - 0.2 - h), 8]} />
        <meshStandardMaterial
          color="#84929B"
          roughness={0.45}
          metalness={0.85}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, signY, 0]} castShadow>
        <cylinderGeometry args={[0.4, 0.4, 0.4, 20]} />
        {ghost || !badge ? (
          <meshStandardMaterial
            color="#06B6D4"
            emissive="#06B6D4"
            emissiveIntensity={0.6}
            transparent={ghost}
            opacity={opacity}
          />
        ) : (
          <meshStandardMaterial
            color="#06B6D4"
            emissive="#06B6D4"
            emissiveIntensity={0.6}
            map={badge}
          />
        )}
      </mesh>
      {topDown && (
        <>
          <Line
            points={[
              [-total / 2, 0.1, frontZ - 0.6],
              [total / 2, 0.1, frontZ - 0.6],
              [total / 2, 0.1, frontZ],
              [-total / 2, 0.1, frontZ],
              [-total / 2, 0.1, frontZ - 0.6],
            ]}
            color="#1E2022"
            lineWidth={2}
          />
          <Line
            points={[
              [accessX - accessW / 2, 0.1, frontZ - 0.6],
              [accessX + accessW / 2, 0.1, frontZ - 0.6],
              [accessX + accessW / 2, 0.1, frontZ],
              [accessX - accessW / 2, 0.1, frontZ],
              [accessX - accessW / 2, 0.1, frontZ - 0.6],
            ]}
            color="#06B6D4"
            lineWidth={2}
          />
          {[-0.3, 0.3].map((x) => (
            <mesh key={x} position={[x, 0.05, -d / 2 + 0.25]}>
              <circleGeometry args={[0.12, 14]} />
              <meshBasicMaterial color="#84929B" toneMapped={false} side={DoubleSide} />
            </mesh>
          ))}
          {badge && (
            <>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, signY + 0.21, 0]}>
                <circleGeometry args={[0.38, 20]} />
                <meshBasicMaterial color="#06B6D4" toneMapped={false} transparent opacity={0.9} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, signY + 0.22, 0]}>
                <planeGeometry args={[0.55, 0.55]} />
                <meshBasicMaterial map={badge} toneMapped={false} transparent />
              </mesh>
            </>
          )}
          <mesh position={[customer[0], 0.05, customer[1]]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.12, 0.3, 3]} />
            <meshBasicMaterial color="#10B981" toneMapped={false} />
          </mesh>
          <mesh position={[staff[0], 0.05, staff[1]]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.12, 0.3, 3]} />
            <meshBasicMaterial color="#F59E0B" toneMapped={false} />
          </mesh>
        </>
      )}
    </group>
  );
}
