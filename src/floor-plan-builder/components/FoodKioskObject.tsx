import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { CanvasTexture, DoubleSide, SRGBColorSpace, Vector3, type Group } from 'three';
import { kioskQueueEntryLocal, kioskQueueLocal, kioskStaffHatchLocal } from '../model/kiosk.ts';
import type { PlanObject } from '../model/types.ts';

function useAwningTexture() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    for (let i = 0; i < 8; i++) {
      context.fillStyle = i % 2 ? '#2563EB' : '#F8F9FA';
      context.fillRect(i * 64, 0, 64, 64);
    }
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function useMenuTexture(menu: string) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 192;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.fillStyle = '#1E2022';
    context.fillRect(0, 0, 1024, 192);
    context.strokeStyle = '#F8F9FA';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(60, 130);
    context.lineTo(60, 70);
    context.arc(78, 70, 18, Math.PI, 0);
    context.lineTo(96, 130);
    context.stroke();
    context.fillStyle = '#F8F9FA';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '600 40px Arial, sans-serif';
    context.fillText(menu.slice(0, 64), 560, 96, 820);
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, [menu]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function useForkBadge() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.fillStyle = '#F59E0B';
    context.beginPath();
    context.arc(128, 128, 120, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#FFFFFF';
    context.fillRect(80, 70, 8, 50);
    context.fillRect(96, 70, 8, 50);
    context.fillRect(112, 70, 8, 50);
    context.fillRect(80, 115, 40, 10);
    context.fillRect(96, 125, 8, 65);
    context.beginPath();
    context.moveTo(152, 70);
    context.lineTo(168, 70);
    context.lineTo(168, 130);
    context.lineTo(152, 110);
    context.fill();
    context.fillRect(156, 130, 8, 60);
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

export function FoodKioskObject({
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

  const awning = useAwningTexture();
  const menu = useMenuTexture(object.kioskMenu);
  const fork = useForkBadge();
  const opacity = ghost ? 0.45 : 1;
  const hw = w / 2;
  const hd = d / 2;
  const openingW = Math.min(w - 0.4, 2.6);
  const openingH = 1.4;
  const counterH = 0.95;
  const queue = kioskQueueLocal(object);
  const entry = kioskQueueEntryLocal(object);
  const hatch = kioskStaffHatchLocal(object);

  if (!near && !topDown) {
    return (
      <group ref={root} name="FoodKioskFar">
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial
            color="#1E2022"
            roughness={0.7}
            metalness={0.1}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
        <mesh position={[0, h + 0.25, hd + 0.4]} rotation={[-0.26, 0, 0]} castShadow>
          <boxGeometry args={[w, 0.06, 1.0]} />
          <meshStandardMaterial
            color="#F8F9FA"
            roughness={0.8}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
      </group>
    );
  }

  const timber = { roughness: 0.7, metalness: 0.1 };
  const steel = { roughness: 0.2, metalness: 0.9 };

  return (
    <group ref={root} name="FoodKiosk">
      <mesh position={[0, h / 2, -hd + 0.05]} castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.1]} />
        <meshStandardMaterial color="#1E2022" {...timber} transparent={ghost} opacity={opacity} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (hw - 0.05), h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.1, h, d]} />
          <meshStandardMaterial color="#9A3412" {...timber} transparent={ghost} opacity={opacity} />
        </mesh>
      ))}
      <mesh position={[0, h - 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.1, d]} />
        <meshStandardMaterial color="#1E2022" {...timber} transparent={ghost} opacity={opacity} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={`pier-${side}`}
          position={[side * (openingW / 2 + (w - openingW) / 4), h / 2, hd - 0.05]}
          castShadow
        >
          <boxGeometry args={[(w - openingW) / 2, h, 0.1]} />
          <meshStandardMaterial color="#9A3412" {...timber} transparent={ghost} opacity={opacity} />
        </mesh>
      ))}
      <mesh
        position={[0, counterH + openingH + Math.max(0.05, h - counterH - openingH) / 2, hd - 0.05]}
        castShadow
      >
        <boxGeometry args={[openingW, Math.max(0.05, h - counterH - openingH), 0.1]} />
        <meshStandardMaterial color="#1E2022" {...timber} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[0, counterH / 2, hd - 0.3]} castShadow receiveShadow>
        <boxGeometry args={[Math.min(2.8, w - 0.2), counterH, 0.6]} />
        <meshStandardMaterial
          color="#7C2D12"
          roughness={0.4}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, counterH + 0.01, hd - 0.3]} castShadow>
        <boxGeometry args={[Math.min(2.8, w - 0.2) + 0.04, 0.04, 0.64]} />
        <meshStandardMaterial
          color="#F8F9FA"
          roughness={0.2}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      {awning && (
        <mesh position={[0, h + 0.28, hd + 0.35]} rotation={[-0.26, 0, 0]} castShadow>
          <boxGeometry args={[w, 0.05, 1.0]} />
          <meshStandardMaterial
            map={awning}
            roughness={0.8}
            transparent={ghost}
            opacity={opacity}
            side={DoubleSide}
          />
        </mesh>
      )}
      {!ghost && (
        <mesh position={[0, h - 0.35, hd + 0.36]}>
          <boxGeometry args={[Math.min(2.6, w - 0.4), 0.03, 0.03]} />
          <meshBasicMaterial color="#FFD9A0" toneMapped={false} />
        </mesh>
      )}
      {!ghost && menu && (
        <group name="MenuBoard">
          <mesh position={[0, h - 0.65, hd - 0.12]} castShadow>
            <boxGeometry args={[Math.min(2.4, w - 0.6), 0.45, 0.03]} />
            <meshStandardMaterial color="#1E2022" roughness={0.95} />
          </mesh>
          <mesh position={[0, h - 0.65, hd - 0.1]}>
            <planeGeometry args={[Math.min(2.3, w - 0.7), 0.4]} />
            <meshBasicMaterial map={menu} toneMapped={false} />
          </mesh>
        </group>
      )}
      <group position={[-w / 4, counterH + 0.02, hd - 0.35]}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[0.5, 0.4, 0.4]} />
          <meshStandardMaterial color="#C0C4C8" {...steel} transparent={ghost} opacity={opacity} />
        </mesh>
        {near &&
          [-0.1, 0.1].map((x) => (
            <mesh key={x} position={[x, 0.05, 0.22]}>
              <cylinderGeometry args={[0.02, 0.015, 0.1, 8]} />
              <meshStandardMaterial
                color="#8A9298"
                {...steel}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
          ))}
      </group>
      <group position={[w / 4, counterH + 0.02, hd - 0.25]} rotation={[0, -0.4, 0]}>
        <mesh position={[0, 0.14, 0]} castShadow>
          <boxGeometry args={[0.25, 0.25, 0.03]} />
          <meshStandardMaterial
            color="#111C27"
            roughness={0.3}
            metalness={0.4}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
        <mesh position={[0, 0.025, 0]}>
          <boxGeometry args={[0.2, 0.05, 0.2]} />
          <meshStandardMaterial
            color="#3A4046"
            roughness={0.5}
            metalness={0.6}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
      </group>
      {near &&
        [-0.06, 0.06].map((x) => (
          <mesh key={x} position={[0, counterH + 0.17, hd - 0.1 + x]} castShadow>
            <cylinderGeometry args={[0.04, 0.035, 0.3, 10]} />
            <meshStandardMaterial
              color="#F8F9FA"
              roughness={0.4}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
        ))}
      {!ghost && fork && (
        <mesh position={[-Math.min(2.8, w - 0.2) / 2 + 0.3, counterH / 2, hd + 0.005]}>
          <circleGeometry args={[0.16, 20]} />
          <meshBasicMaterial map={fork} toneMapped={false} transparent />
        </mesh>
      )}
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
            color="#1E2022"
            lineWidth={2.5}
          />
          <Line
            points={[
              [-hw, 0.1, hd - 0.6],
              [hw, 0.1, hd - 0.6],
            ]}
            color="#7C2D12"
            lineWidth={2}
          />
          <Line
            points={[
              ...queue.map(([x, z]): [number, number, number] => [x, 0.1, z]),
              [queue[0]![0], 0.1, queue[0]![1]] as [number, number, number],
            ]}
            color="#2563EB"
            lineWidth={1.5}
            dashed
          />
          <mesh position={[entry[0], 0.05, entry[1]]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.2, 0.6, 3]} />
            <meshBasicMaterial color="#2563EB" toneMapped={false} />
          </mesh>
          <mesh position={[hatch[0], 0.05, hatch[1]]}>
            <circleGeometry args={[0.12, 12]} />
            <meshBasicMaterial color="#F59E0B" toneMapped={false} side={DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  );
}
