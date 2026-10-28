import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import {
  CanvasTexture,
  CatmullRomCurve3,
  DoubleSide,
  ExtrudeGeometry,
  Matrix4,
  Shape,
  SRGBColorSpace,
  Vector3,
  type Group,
  type InstancedMesh,
} from 'three';
import { kioskQueueEntryLocal, kioskQueueLocal, kioskStaffHatchLocal } from '../model/kiosk.ts';
import type { PlanObject } from '../model/types.ts';

function CupStacks({ ghost }: { ghost: boolean }) {
  const cups = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!cups.current) {
      return;
    }
    const matrix = new Matrix4();
    for (let stack = 0; stack < 2; stack++) {
      for (let cup = 0; cup < 6; cup++) {
        matrix.makeTranslation(0, 0.0275 + cup * 0.049, stack ? 0.06 : -0.06);
        cups.current.setMatrixAt(stack * 6 + cup, matrix);
      }
    }
    cups.current.instanceMatrix.needsUpdate = true;
    cups.current.computeBoundingSphere();
  }, []);
  return (
    <instancedMesh ref={cups} args={[undefined, undefined, 12]} castShadow>
      <cylinderGeometry args={[0.04, 0.035, 0.055, 10, 1, true]} />
      <meshStandardMaterial
        color="#F8F9FA"
        roughness={0.4}
        side={DoubleSide}
        transparent={ghost}
        opacity={ghost ? 0.45 : 1}
      />
    </instancedMesh>
  );
}

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
    canvas.width = 2048;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.fillStyle = '#1E2022';
    context.fillRect(0, 0, 2048, 512);
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
    context.font = '600 64px Arial, sans-serif';
    const lines: string[] = [];
    for (const paragraph of menu.split(/[|\n]/)) {
      let line = '';
      for (const word of paragraph.trim().split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (line && context.measureText(next).width > 1780) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      lines.push(line);
    }
    const lineHeight = Math.min(120, 440 / Math.max(1, lines.length));
    context.font = `600 ${Math.min(64, lineHeight * 0.8)}px Arial, sans-serif`;
    lines.forEach((line, index) =>
      context.fillText(line, 1100, 36 + lineHeight * (index + 0.5), 1780),
    );
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, [menu]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function useQueueLabel() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.clearRect(0, 0, 512, 96);
    context.strokeStyle = '#2563EB';
    context.lineWidth = 6;
    context.setLineDash([18, 12]);
    context.strokeRect(6, 6, 500, 84);
    context.setLineDash([]);
    context.fillStyle = '#2563EB';
    context.font = '700 34px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('FOOD KIOSK - QUEUE CLEAR ZONE', 256, 50, 470);
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, []);
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
  const near: boolean = true;

  const awning = useAwningTexture();
  const menu = useMenuTexture(object.kioskMenu);
  const fork = useForkBadge();
  const queueLabel = useQueueLabel();
  const opacity = ghost ? 0.45 : 1;
  const hw = w / 2;
  const hd = d / 2;
  const openingW = w - 0.4;
  const openingH = Math.min(1.4, h - 1.05);
  const counterH = 0.95;
  const menuY = Math.min(h - 0.65, counterH + openingH / 2 - 0.05);
  const queue = kioskQueueLocal(object);
  const entry = kioskQueueEntryLocal(object);
  const hatch = kioskStaffHatchLocal(object);
  const steamWand = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(0.23, 0.25, 0.1),
        new Vector3(0.29, 0.21, 0.17),
        new Vector3(0.29, 0.04, 0.25),
      ]),
    [],
  );
  const awningGeometry = useMemo(() => {
    const profile = new Shape();
    const drop = 0.8 * Math.tan(Math.PI / 12);
    profile.moveTo(0, 0);
    profile.lineTo(-0.8, -drop);
    profile.lineTo(-0.8, -drop - 0.05);
    profile.lineTo(0, -0.05);
    profile.closePath();
    const geometry = new ExtrudeGeometry(profile, { depth: w, bevelEnabled: false });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-w / 2, 0, 0);
    const positions = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) {
      uv.setXY(i, positions.getX(i) / w + 0.5, positions.getZ(i) / 0.8);
    }
    return geometry;
  }, [w]);
  useEffect(() => () => awningGeometry.dispose(), [awningGeometry]);

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
        <mesh userData={{ routeOccluder: true }} position={[0, h, hd]} castShadow>
          <primitive object={awningGeometry} attach="geometry" />
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
      <mesh position={[0.4, h / 2, -hd + 0.05]} castShadow receiveShadow>
        <boxGeometry args={[w - 0.8, h, 0.1]} />
        <meshStandardMaterial color="#1E2022" {...timber} transparent={ghost} opacity={opacity} />
      </mesh>
      <group name="StaffHatch" position={[-hw + 0.4, 0, -hd + 0.05]}>
        <mesh position={[0, 0.95, 0]} castShadow>
          <boxGeometry args={[0.7, 1.9, 0.06]} />
          <meshStandardMaterial color="#9A3412" {...timber} transparent={ghost} opacity={opacity} />
        </mesh>
        <mesh position={[0, (h + 1.9) / 2, 0]}>
          <boxGeometry args={[0.8, h - 1.9, 0.1]} />
          <meshStandardMaterial color="#1E2022" {...timber} transparent={ghost} opacity={opacity} />
        </mesh>
        {[-0.375, 0.375].map((x) => (
          <mesh key={x} position={[x, 0.95, 0]}>
            <boxGeometry args={[0.05, 1.9, 0.1]} />
            <meshStandardMaterial
              color="#1E2022"
              {...timber}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
        ))}
        {near && (
          <mesh position={[0.23, 1, -0.05]}>
            <boxGeometry args={[0.1, 0.025, 0.04]} />
            <meshStandardMaterial color="#C0C4C8" {...steel} />
          </mesh>
        )}
      </group>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (hw - 0.05), h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.1, h, d]} />
          <meshStandardMaterial color="#9A3412" {...timber} transparent={ghost} opacity={opacity} />
        </mesh>
      ))}
      <mesh userData={{ routeOccluder: true }} position={[0, h - 0.05, 0]} castShadow receiveShadow>
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
      <mesh position={[0, (counterH - 0.04) / 2, hd - 0.3]} castShadow receiveShadow>
        <boxGeometry args={[w - 0.2, counterH - 0.04, 0.6]} />
        <meshStandardMaterial
          color="#7C2D12"
          roughness={0.4}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, counterH - 0.02, hd - 0.3]} castShadow>
        <boxGeometry args={[w - 0.2, 0.04, 0.6]} />
        <meshStandardMaterial
          color="#F8F9FA"
          roughness={0.2}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      {awning && (
        <mesh userData={{ routeOccluder: true }} position={[0, h, hd]} castShadow>
          <primitive object={awningGeometry} attach="geometry" />
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
        <mesh position={[0, h - 0.8 * Math.tan(Math.PI / 12) - 0.07, hd + 0.78]}>
          <boxGeometry args={[Math.min(2.6, w - 0.4), 0.03, 0.03]} />
          <meshBasicMaterial color="#FFD9A0" toneMapped={false} />
        </mesh>
      )}
      {!ghost && menu && (
        <group name="MenuBoard">
          <mesh position={[0, menuY, hd - 0.12]} castShadow>
            <boxGeometry args={[Math.min(2.4, w - 0.6), 0.45, 0.03]} />
            <meshStandardMaterial color="#1E2022" roughness={0.95} />
          </mesh>
          <mesh position={[0, menuY, hd - 0.1]}>
            <planeGeometry args={[Math.min(2.3, w - 0.7), 0.4]} />
            <meshBasicMaterial map={menu} toneMapped={false} />
          </mesh>
        </group>
      )}
      <group position={[-w / 4, counterH, hd - 0.35]}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <boxGeometry args={[0.5, 0.4, 0.4]} />
          <meshStandardMaterial color="#C0C4C8" {...steel} transparent={ghost} opacity={opacity} />
        </mesh>
        {near && (
          <mesh name="SteamWand">
            <tubeGeometry args={[steamWand, 8, 0.008, 6]} />
            <meshStandardMaterial
              color="#C0C4C8"
              {...steel}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
        )}
        {near && (
          <>
            {[-0.12, 0.12].map((x) => (
              <mesh key={`dial-${x}`} position={[x, 0.32, 0.205]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.035, 0.035, 0.012, 12]} />
                <meshStandardMaterial
                  color="#F8F9FA"
                  roughness={0.3}
                  transparent={ghost}
                  opacity={opacity}
                />
              </mesh>
            ))}
            <mesh position={[0, 0.32, 0.212]}>
              <boxGeometry args={[0.005, 0.025, 0.005]} />
              <meshBasicMaterial color="#EF4444" toneMapped={false} />
            </mesh>
          </>
        )}
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
      <group position={[w / 4, counterH, hd - 0.25]} rotation={[0, -0.4, 0]}>
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
      {near && (
        <group position={[0, counterH, hd - 0.14]}>
          <CupStacks ghost={ghost} />
        </group>
      )}
      {!ghost && fork && (
        <mesh position={[-Math.min(2.8, w - 0.2) / 2 + 0.3, counterH / 2, hd + 0.005]}>
          <circleGeometry args={[0.16, 20]} />
          <meshBasicMaterial map={fork} toneMapped={false} transparent />
        </mesh>
      )}
      {!ghost && queueLabel && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.015, hd + object.kioskQueueDepth / 2]}
        >
          <planeGeometry args={[Math.min(w - 0.2, 2.6), 0.5]} />
          <meshBasicMaterial
            map={queueLabel}
            toneMapped={false}
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </mesh>
      )}
      {(topDown || !ghost) && (
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
            visible={topDown}
            depthTest={false}
          />
          <Line
            points={[
              [-hw, 0.1, hd - 0.6],
              [hw, 0.1, hd - 0.6],
            ]}
            color="#7C2D12"
            lineWidth={2}
            visible={topDown}
            depthTest={false}
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
          {Array.from({ length: 7 }, (_, i) => (
            <Line
              key={`hatch-${i}`}
              points={[
                [-hw + ((i + 0.5) * w) / 7, 0.1, hd - 0.15],
                [-hw + ((i + 0.5) * w) / 7, 0.1, hd + 0.85],
              ]}
              color={i % 2 ? '#2563EB' : '#F8F9FA'}
              lineWidth={2}
              visible={topDown}
              depthTest={false}
            />
          ))}
          <mesh
            visible={topDown}
            position={[entry[0], 0.05, entry[1]]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <coneGeometry args={[0.2, 0.6, 3]} />
            <meshBasicMaterial color="#2563EB" toneMapped={false} />
          </mesh>
          <mesh
            visible={topDown}
            position={[hatch[0], 0.05, hatch[1]]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[0.12, 12]} />
            <meshBasicMaterial color="#F59E0B" toneMapped={false} side={DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  );
}
