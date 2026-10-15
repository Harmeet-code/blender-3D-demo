import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { CanvasTexture, DoubleSide, SRGBColorSpace, Vector3, type Group } from 'three';
import { materials } from './materials.ts';
import { washroomAccent, washroomLandingLocal, washroomOpeningOf } from '../model/washroom.ts';
import type { PlanObject } from '../model/types.ts';

function usePictogram(gender: PlanObject['gender'], accent: string, whiteOnly = false) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 384;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    if (!whiteOnly) {
      context.fillStyle = accent;
      context.fillRect(0, 0, 256, 384);
    } else {
      context.clearRect(0, 0, 256, 384);
    }
    context.fillStyle = '#FFFFFF';
    const female = gender !== 'men';
    context.beginPath();
    context.arc(128, 84, 44, 0, Math.PI * 2);
    context.fill();
    if (female) {
      context.beginPath();
      context.moveTo(128, 140);
      context.lineTo(76, 250);
      context.lineTo(180, 250);
      context.closePath();
      context.fill();
      context.fillRect(96, 250, 20, 90);
      context.fillRect(140, 250, 20, 90);
    } else {
      context.fillRect(92, 140, 72, 110);
      context.fillRect(96, 250, 22, 90);
      context.fillRect(138, 250, 22, 90);
      context.fillRect(64, 150, 24, 80);
      context.fillRect(168, 150, 24, 80);
    }
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, [gender, accent, whiteOnly]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

export function WashroomObject({
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
  const [w, h, d] = object.dimensions;
  const opening = washroomOpeningOf(object);
  const accent = washroomAccent(object);
  const wallColor = color.startsWith('#') ? color : materials.roofCanvas.color;
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

  const pictogram = usePictogram(object.gender, accent);
  const roofPictogram = usePictogram(object.gender, accent, true);
  const opacity = ghost ? 0.45 : 1;
  const t = 0.08;
  const hw = w / 2;
  const hd = d / 2;
  const gapHalf = opening / 2;
  const frontSignX = (gapHalf + hw) / 2;
  const doorH = Math.min(2.2, h - 0.1);
  const panel = { roughness: 0.85, metalness: 0.05 };
  const [, landingZ] = washroomLandingLocal(object);

  const outline: [number, number, number][] = [
    [-hw, 0.1, -hd],
    [hw, 0.1, -hd],
    [hw, 0.1, hd],
    [-hw, 0.1, hd],
    [-hw, 0.1, -hd],
  ];

  if (!near && !topDown) {
    return (
      <group ref={root} name="WashroomFar">
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial
            color={wallColor}
            {...panel}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={root} name="WashroomBlock">
      <mesh
        position={[-(gapHalf + (hw - gapHalf) / 2), h / 2, hd - t / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[hw - gapHalf, h, t]} />
        <meshStandardMaterial color={wallColor} {...panel} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[gapHalf + (hw - gapHalf) / 2, h / 2, hd - t / 2]} castShadow receiveShadow>
        <boxGeometry args={[hw - gapHalf, h, t]} />
        <meshStandardMaterial color={wallColor} {...panel} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[0, doorH + (h - doorH) / 2, hd - t / 2]} castShadow>
        <boxGeometry args={[opening, Math.max(0.05, h - doorH), t]} />
        <meshStandardMaterial color={wallColor} {...panel} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[0, h / 2, -hd + t / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, h, t]} />
        <meshStandardMaterial color={wallColor} {...panel} transparent={ghost} opacity={opacity} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (hw - t / 2), h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[t, h, d]} />
          <meshStandardMaterial
            color={wallColor}
            {...panel}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
      ))}
      <mesh position={[0, h - 0.025, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 0.05, d]} />
        <meshStandardMaterial color={wallColor} {...panel} transparent={ghost} opacity={opacity} />
      </mesh>
      <mesh position={[0, h / 2, hd - 1.0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, h, t]} />
        <meshStandardMaterial
          color={wallColor}
          {...panel}
          transparent={ghost}
          opacity={opacity}
          side={DoubleSide}
        />
      </mesh>
      {[
        { size: [w, 0.1, 0.1] as const, at: [0, 0.05, hd - 0.05] as const },
        { size: [w, 0.1, 0.1] as const, at: [0, 0.05, -hd + 0.05] as const },
        { size: [0.1, 0.1, d] as const, at: [hw - 0.05, 0.05, 0] as const },
        { size: [0.1, 0.1, d] as const, at: [-hw + 0.05, 0.05, 0] as const },
      ].map((item, index) => (
        <mesh key={`plinth-${index}`} position={[...item.at]} receiveShadow>
          <boxGeometry args={[...item.size]} />
          <meshStandardMaterial {...materials.aluminum} transparent={ghost} opacity={opacity} />
        </mesh>
      ))}
      {near &&
        [
          [-hw, -hd],
          [hw, -hd],
          [hw, hd],
          [-hw, hd],
        ].map(([x, z], index) => (
          <mesh key={`trim-${index}`} position={[x!, h / 2, z!]} castShadow>
            <boxGeometry args={[0.06, h, 0.06]} />
            <meshStandardMaterial {...materials.aluminum} transparent={ghost} opacity={opacity} />
          </mesh>
        ))}
      {!ghost && pictogram && (
        <>
          <mesh name="WashroomSignFront" position={[frontSignX, 1.8, hd + 0.006]}>
            <boxGeometry args={[0.4, 0.6, 0.01]} />
            <meshStandardMaterial color={accent} roughness={0.5} metalness={0} />
          </mesh>
          <mesh position={[frontSignX, 1.8, hd + 0.012]}>
            <planeGeometry args={[0.36, 0.54]} />
            <meshBasicMaterial map={pictogram} toneMapped={false} transparent />
          </mesh>
          <mesh name="WashroomSignBaffle" position={[0, 1.8, hd - 1.0 + t / 2 + 0.006]}>
            <boxGeometry args={[0.4, 0.6, 0.01]} />
            <meshStandardMaterial color={accent} roughness={0.5} metalness={0} />
          </mesh>
          <mesh position={[0, 1.8, hd - 1.0 + t / 2 + 0.012]}>
            <planeGeometry args={[0.36, 0.54]} />
            <meshBasicMaterial map={pictogram} toneMapped={false} transparent />
          </mesh>
          {near && (
            <>
              <mesh position={[frontSignX, 1.8, hd + 0.004]}>
                <planeGeometry args={[0.48, 0.68]} />
                <meshBasicMaterial color={accent} toneMapped={false} transparent opacity={0.35} />
              </mesh>
              <mesh position={[0, 1.8, hd - 1.0 + t / 2 + 0.004]}>
                <planeGeometry args={[0.48, 0.68]} />
                <meshBasicMaterial color={accent} toneMapped={false} transparent opacity={0.35} />
              </mesh>
            </>
          )}
        </>
      )}
      <mesh name="GenderAccentTrim" position={[0, h - 0.2, hd + 0.02]} castShadow>
        <boxGeometry args={[Math.min(w - 0.4, 2.2), 0.3, 0.04]} />
        <meshStandardMaterial
          color={accent}
          roughness={0.6}
          metalness={0}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      {topDown && (
        <>
          <Line points={outline} color="#1E2022" lineWidth={2.5} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, h + 0.01, 0]}>
            <planeGeometry args={[w - 0.1, d - 0.1]} />
            <meshBasicMaterial color={accent} toneMapped={false} transparent opacity={0.85} />
          </mesh>
          {roofPictogram && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, h + 0.02, 0]}>
              <planeGeometry args={[Math.min(1.2, w - 0.6), Math.min(1.8, d - 0.6)]} />
              <meshBasicMaterial map={roofPictogram} toneMapped={false} transparent />
            </mesh>
          )}
          <mesh position={[0, 0.05, landingZ]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.25, 0.7, 3]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
        </>
      )}
    </group>
  );
}
