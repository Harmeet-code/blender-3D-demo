import { useEffect, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { CanvasTexture, SRGBColorSpace, type Group } from 'three';
import { binCompartments, binStreamColor } from '../model/bin.ts';
import type { PlanObject } from '../model/types.ts';

export function useMobiusBadge() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.fillStyle = '#06B6D4';
    context.fillRect(8, 8, 240, 240);
    context.strokeStyle = '#FFFFFF';
    context.lineWidth = 16;
    for (let i = 0; i < 3; i++) {
      context.save();
      context.translate(128, 128);
      context.rotate((i * 120 * Math.PI) / 180);
      context.beginPath();
      context.arc(0, -50, 40, -Math.PI / 4, Math.PI / 2);
      context.stroke();
      context.fillStyle = '#FFFFFF';
      context.beginPath();
      context.moveTo(35, -20);
      context.lineTo(55, -20);
      context.lineTo(45, -2);
      context.fill();
      context.restore();
    }
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function useOrganicsBadge({ size = 128 }: { size?: number }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    const s = size / 128;
    context.fillStyle = '#10B981';
    context.fillRect(4 * s, 4 * s, 120 * s, 120 * s);
    context.fillStyle = '#FFFFFF';
    context.beginPath();
    context.ellipse(64 * s, 52 * s, 26 * s, 34 * s, 0.5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#FFFFFF';
    context.lineWidth = 7 * s;
    context.beginPath();
    context.moveTo(64 * s, 84 * s);
    context.quadraticCurveTo(64 * s, 104 * s, 84 * s, 112 * s);
    context.stroke();
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    return value;
  }, [size]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function useTrashBadge() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.fillStyle = '#1E2022';
    context.fillRect(4, 4, 120, 120);
    context.fillStyle = '#FFFFFF';
    context.fillRect(44, 52, 40, 56);
    context.fillRect(38, 44, 52, 8);
    context.fillRect(58, 32, 12, 12);
    context.strokeStyle = '#1E2022';
    context.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      context.beginPath();
      context.moveTo(54 + i * 10, 60);
      context.lineTo(54 + i * 10, 100);
      context.stroke();
    }
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    return value;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

export function BinObject({
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

  const mobius = useMobiusBadge();
  const organics = useOrganicsBadge({});
  const trash = useTrashBadge();
  const badge =
    object.binStream === 'organics' ? organics : object.binStream === 'recycling' ? mobius : trash;
  const accent = binStreamColor(object);
  const body = object.binBody === 'steel' ? '#C0C4C8' : '#1E2022';
  const opacity = ghost ? 0.45 : 1;
  const steel = { roughness: 0.3, metalness: 0.7 };
  const compartments = binCompartments(object);
  const unitW = w / compartments;

  if (!near && !topDown) {
    return (
      <group ref={root} name="BinFar">
        <mesh position={[0, h / 2, 0]} castShadow>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={body} {...steel} transparent={ghost} opacity={opacity} />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={root} name="WasteStation">
      {Array.from({ length: compartments }, (_, index) => {
        const x = -w / 2 + unitW * (index + 0.5);
        return (
          <group key={index} position={[x, 0, 0]}>
            <mesh position={[0, (h - 0.08) / 2 + 0.04, 0]} castShadow receiveShadow>
              <boxGeometry args={[unitW - 0.02, h - 0.08, d - 0.02]} />
              <meshStandardMaterial color={body} {...steel} transparent={ghost} opacity={opacity} />
            </mesh>
            {[
              {
                size: [unitW, 0.08, (d - 0.25) / 2] as const,
                at: [0, h - 0.04, (0.25 + d) / 4] as const,
              },
              {
                size: [unitW, 0.08, (d - 0.25) / 2] as const,
                at: [0, h - 0.04, -(0.25 + d) / 4] as const,
              },
              {
                size: [(unitW - 0.35) / 2, 0.08, 0.25] as const,
                at: [(0.35 + unitW) / 4, h - 0.04, 0] as const,
              },
              {
                size: [(unitW - 0.35) / 2, 0.08, 0.25] as const,
                at: [-(0.35 + unitW) / 4, h - 0.04, 0] as const,
              },
            ].map((item, rim) => (
              <mesh key={`lid-${rim}`} position={[...item.at]} castShadow>
                <boxGeometry args={[...item.size]} />
                <meshStandardMaterial
                  color={accent}
                  roughness={0.3}
                  metalness={0.4}
                  transparent={ghost}
                  opacity={opacity}
                />
              </mesh>
            ))}
            {near &&
              [0, 1, 2, 3, 4].map((dot) => (
                <mesh
                  key={`braille-${dot}`}
                  position={[unitW / 2 - 0.06 - dot * 0.025, h + 0.002, d / 2 - 0.03]}
                >
                  <sphereGeometry args={[0.006, 6, 5]} />
                  <meshStandardMaterial color={accent} roughness={0.5} />
                </mesh>
              ))}
            <mesh position={[0, h - 0.12, 0]}>
              <boxGeometry args={[unitW - 0.12, 0.12, d - 0.12]} />
              <meshStandardMaterial
                color="#14181C"
                roughness={0.95}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
            <mesh position={[0, 0.02, 0]} receiveShadow>
              <boxGeometry args={[unitW - 0.05, 0.04, d - 0.05]} />
              <meshStandardMaterial
                color="#3A4046"
                roughness={0.6}
                metalness={0.4}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
            {!ghost && badge && (
              <>
                <mesh position={[0, h / 2 - 0.05, d / 2 + 0.003]}>
                  <planeGeometry args={[0.25, 0.25]} />
                  <meshBasicMaterial map={badge} toneMapped={false} transparent />
                </mesh>
                {near && (
                  <mesh position={[unitW / 2 - 0.06, h / 2, d / 2 + 0.002]}>
                    <boxGeometry args={[0.015, 0.12, 0.008]} />
                    <meshStandardMaterial color="#9AA2A8" roughness={0.4} metalness={0.7} />
                  </mesh>
                )}
              </>
            )}
          </group>
        );
      })}
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
          <Line
            points={[
              [-w / 2 + 0.04, 0.1, -d / 2 + 0.04],
              [w / 2 - 0.04, 0.1, -d / 2 + 0.04],
              [w / 2 - 0.04, 0.1, d / 2 - 0.04],
              [-w / 2 + 0.04, 0.1, d / 2 - 0.04],
              [-w / 2 + 0.04, 0.1, -d / 2 + 0.04],
            ]}
            color={accent}
            lineWidth={3}
          />
          {badge && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, h + 0.01, 0]}>
              <planeGeometry args={[Math.min(0.4, w - 0.2), Math.min(0.4, w - 0.2)]} />
              <meshBasicMaterial map={badge} toneMapped={false} transparent />
            </mesh>
          )}
        </>
      )}
    </group>
  );
}
