import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshStandardMaterial } from 'three';
import type { Room } from '../../entities/building/model/building-schema.ts';
import { wallHeightFor, wallSpans } from '../../entities/building/model/wall-spans.ts';

const WALL_THICKNESS = 0.15;

interface WallBox {
  key: string;
  position: [number, number, number];
  yaw: number;
  length: number;
  height: number;
}

/** Continuous extruded wall shells with entrance openings. */
export function RoomWalls({ rooms, dimmed = false }: { rooms: Room[]; dimmed?: boolean }) {
  const material = useMemo(
    () => new MeshStandardMaterial({ color: '#8fa3b0', transparent: true, opacity: 1 }),
    [],
  );
  const target = useRef(1);
  target.current = dimmed ? 0.2 : 1;
  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);
  useFrame((_, delta) => {
    const next = material.opacity + (target.current - material.opacity) * Math.min(1, delta * 5);
    if (Math.abs(next - material.opacity) > 0.001) {
      material.opacity = next;
    }
  });
  const walls = useMemo<WallBox[]>(
    () =>
      rooms.flatMap((room) => {
        const height = wallHeightFor(room);
        return wallSpans(room).map((span, index) => {
          const dx = span.b[0] - span.a[0];
          const dz = span.b[1] - span.a[1];
          return {
            key: `${room.id}:${index}`,
            position: [(span.a[0] + span.b[0]) / 2, height / 2, (span.a[1] + span.b[1]) / 2],
            yaw: -Math.atan2(dz, dx),
            length: Math.hypot(dx, dz),
            height,
          };
        });
      }),
    [rooms],
  );
  return (
    <group>
      {walls.map((wall) => (
        <mesh key={wall.key} position={wall.position} rotation-y={wall.yaw} material={material}>
          <boxGeometry args={[wall.length, wall.height, WALL_THICKNESS]} />
        </mesh>
      ))}
    </group>
  );
}
