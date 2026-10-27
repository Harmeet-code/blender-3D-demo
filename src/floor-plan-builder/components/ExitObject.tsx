import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { CanvasTexture, DoubleSide, SRGBColorSpace, Vector3, type Group } from 'three';
import { exitOpening, exitSinkLocal } from '../model/exit.ts';
import { useServiceMotion } from './use-service-motion.ts';
import type { PlanObject } from '../model/types.ts';

function useRunningMan() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.fillStyle = '#10B981';
    context.fillRect(0, 0, 256, 128);
    context.fillStyle = '#FFFFFF';
    context.fillRect(20, 20, 40, 88);
    context.beginPath();
    context.arc(90, 35, 10, 0, Math.PI * 2);
    context.fill();
    context.font = '700 27px Arial, sans-serif';
    context.textAlign = 'center';
    context.fillText('EXIT', 196, 112, 96);
    context.strokeStyle = '#FFFFFF';
    context.lineWidth = 9;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(90, 48);
    context.lineTo(105, 70);
    context.lineTo(120, 65);
    context.moveTo(90, 52);
    context.lineTo(75, 75);
    context.lineTo(65, 95);
    context.moveTo(105, 70);
    context.lineTo(95, 110);
    context.stroke();
    context.fillStyle = '#FFFFFF';
    context.beginPath();
    context.moveTo(160, 64);
    context.lineTo(210, 64);
    context.lineTo(210, 48);
    context.lineTo(236, 64);
    context.lineTo(210, 80);
    context.lineTo(210, 64);
    context.fill();
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function useFloorArrow() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 192;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.clearRect(0, 0, 128, 192);
    context.fillStyle = '#10B981';
    for (let i = 0; i < 3; i++) {
      const y = 30 + i * 55;
      context.beginPath();
      context.moveTo(24, y + 30);
      context.lineTo(64, y);
      context.lineTo(104, y + 30);
      context.lineTo(104, y + 48);
      context.lineTo(64, y + 18);
      context.lineTo(24, y + 48);
      context.closePath();
      context.fill();
    }
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    return value;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

export function ExitObject({
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
  const open = object.exitOpen;
  const root = useRef<Group>(null);
  const leaf = useRef<Group>(null);
  const swing = useRef({ value: open ? 1 : 0, from: open ? 1 : 0, started: 0 });
  const [near, setNear] = useState(true);
  const { animate, invalidate } = useServiceMotion(!ghost);
  const world = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
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
    const target = open ? 1 : 0;
    const state = swing.current;
    if (state.value !== target) {
      const t = animate ? Math.min(1, (performance.now() - state.started) / 600) : 1;
      state.value = state.from + (target - state.from) * (1 - (1 - t) ** 2);
      if (t === 1) {
        state.value = target;
      }
      if (leaf.current) {
        leaf.current.rotation.y = (Math.PI / 2) * state.value;
      }
      if (t < 1) {
        invalidate();
      }
    }
  });

  useEffect(() => {
    const state = swing.current;
    state.from = state.value;
    state.started = performance.now();
    invalidate();
  }, [open, invalidate]);

  const sign = useRunningMan();
  const arrow = useFloorArrow();
  // Frame/leaf finish: Safety Green (spec allows green or dark; green chosen
  // for egress visibility against hall walls).
  const pushLabel = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 48;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.clearRect(0, 0, 256, 48);
    context.fillStyle = '#FFFFFF';
    context.font = '700 30px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('PUSH TO OPEN', 128, 25, 250);
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    return value;
  }, []);
  useEffect(() => () => pushLabel?.dispose(), [pushLabel]);
  const opacity = ghost ? 0.45 : 1;
  const hw = w / 2;
  const { clear: clearW, jamb } = exitOpening(w);
  const doorH = h - 0.15;
  const hingeX = -clearW / 2;
  const sink = exitSinkLocal();
  const swingArc: [number, number, number][] = Array.from({ length: 13 }, (_, i) => {
    const angle = (i / 12) * (Math.PI / 2);
    return [hingeX + Math.cos(angle) * clearW, 0.1, -Math.sin(angle) * clearW];
  });

  if (!near && !topDown) {
    // Six quads (12 triangles), preserving the opening and current hinge angle.
    return (
      <group ref={root} name="ExitFar">
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * (hw - jamb / 2), h / 2, 0]}>
            <planeGeometry args={[jamb, h]} />
            <meshStandardMaterial
              color="#10B981"
              roughness={0.5}
              metalness={0.3}
              side={DoubleSide}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
        ))}
        <mesh position={[0, h - 0.075, 0]}>
          <planeGeometry args={[w, 0.15]} />
          <meshStandardMaterial
            color="#10B981"
            roughness={0.5}
            metalness={0.3}
            side={DoubleSide}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
        <group
          ref={leaf}
          position={[hingeX, 0, 0]}
          rotation-y={(Math.PI / 2) * swing.current.value}
        >
          <mesh position={[clearW / 2, doorH / 2, 0]}>
            <planeGeometry args={[clearW, doorH]} />
            <meshStandardMaterial
              color="#10B981"
              roughness={0.5}
              metalness={0.3}
              side={DoubleSide}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
        </group>
        <mesh position={[0, h + 0.15, d / 2 + 0.051]}>
          <planeGeometry args={[0.8, 0.3]} />
          <meshBasicMaterial
            map={ghost ? undefined : sign}
            color={ghost ? '#10B981' : '#FFFFFF'}
            side={DoubleSide}
            toneMapped={false}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
        {!ghost && arrow && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, d / 2 + 0.75]}>
            <planeGeometry args={[1, 1.5]} />
            <meshBasicMaterial map={arrow} transparent toneMapped={false} depthWrite={false} />
          </mesh>
        )}
      </group>
    );
  }

  return (
    <group ref={root} name="EmergencyExit">
      <mesh position={[-hw + jamb / 2, h / 2, 0]} castShadow>
        <boxGeometry args={[jamb, h, d]} />
        <meshStandardMaterial
          color="#10B981"
          roughness={0.5}
          metalness={0.3}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[hw - jamb / 2, h / 2, 0]} castShadow>
        <boxGeometry args={[jamb, h, d]} />
        <meshStandardMaterial
          color="#10B981"
          roughness={0.5}
          metalness={0.3}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, h - 0.075, 0]} castShadow>
        <boxGeometry args={[w, 0.15, d]} />
        <meshStandardMaterial
          color="#10B981"
          roughness={0.5}
          metalness={0.3}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      <group ref={leaf} position={[hingeX, 0, 0]} rotation-y={(Math.PI / 2) * swing.current.value}>
        <mesh position={[clearW / 2, doorH / 2, 0]} castShadow>
          <boxGeometry args={[clearW, doorH, 0.06]} />
          <meshStandardMaterial
            color="#10B981"
            roughness={0.5}
            metalness={0.3}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
        <mesh position={[clearW / 2, 1.0, 0.08]}>
          <boxGeometry args={[Math.min(1.1, clearW - 0.1), 0.08, 0.1]} />
          <meshStandardMaterial
            color="#C0C4C8"
            roughness={0.3}
            metalness={0.8}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
        {!ghost && near && (
          <>
            <mesh position={[clearW / 2, 1.0, 0.135]}>
              <boxGeometry args={[0.3, 0.05, 0.012]} />
              <meshStandardMaterial color="#EF4444" roughness={0.3} metalness={0.2} />
            </mesh>
            <mesh position={[clearW / 2 - Math.min(0.42, clearW / 2 - 0.15), 1.0, 0.132]}>
              <planeGeometry args={[0.24, 0.045]} />
              <meshBasicMaterial map={pushLabel} toneMapped={false} transparent />
            </mesh>
          </>
        )}
      </group>
      <mesh position={[0, h + 0.15, d / 2]} castShadow>
        <boxGeometry args={[0.8, 0.3, 0.1]} />
        <meshStandardMaterial
          color="#10B981"
          roughness={0.5}
          metalness={0.1}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      {!ghost && sign && (
        <mesh position={[0, h + 0.15, d / 2 + 0.051]}>
          <planeGeometry args={[0.76, 0.26]} />
          <meshBasicMaterial map={sign} toneMapped={false} />
        </mesh>
      )}
      {near && (
        <>
          {[-0.25, 0.25].map((x) => (
            <group key={x} position={[x, h + 0.43, d / 2]}>
              <mesh castShadow>
                <boxGeometry args={[0.12, 0.08, 0.08]} />
                <meshStandardMaterial
                  color="#1E2022"
                  roughness={0.5}
                  metalness={0.3}
                  transparent={ghost}
                  opacity={opacity}
                />
              </mesh>
              <mesh position={[0, -0.03, 0.02]}>
                <sphereGeometry args={[0.025, 8, 6]} />
                <meshBasicMaterial color="#FFF7D6" toneMapped={false} />
              </mesh>
            </group>
          ))}
        </>
      )}
      {!ghost && arrow && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, d / 2 + 0.75]}>
          <planeGeometry args={[1.0, 1.5]} />
          <meshBasicMaterial
            map={arrow}
            toneMapped={false}
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </mesh>
      )}
      {topDown && (
        <>
          <Line
            points={[
              [-hw, 0.1, -d / 2],
              [hw, 0.1, -d / 2],
              [hw, 0.1, d / 2],
              [-hw, 0.1, d / 2],
              [-hw, 0.1, -d / 2],
            ]}
            color="#10B981"
            lineWidth={2.5}
            depthTest={false}
          />
          <Line
            points={swingArc}
            color="#10B981"
            lineWidth={1.5}
            dashed
            dashSize={0.12}
            gapSize={0.08}
            depthTest={false}
          />
          <mesh position={[sink[0], 0.05, sink[1]]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.15, 0.4, 3]} />
            <meshBasicMaterial color="#10B981" toneMapped={false} side={DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  );
}
