import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshStandardMaterial } from 'three';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import type { Room } from '@/features/building/model/building-schema.ts';
import { wallHeightFor, wallSpans } from '@/features/building/model/wall-spans.ts';
import { boothPhysical } from '@/features/building/model/booth-physical.ts';
import { frameRuntime } from '../model/frame-runtime.ts';

const WALL_THICKNESS = 0.15;

interface WallBox {
  key: string;
  position: [number, number, number];
  yaw: number;
  length: number;
  height: number;
  thickness: number;
}

/** Continuous extruded wall shells with entrance openings. */
export function RoomWalls({ rooms, dimmed = false }: { rooms: Room[]; dimmed?: boolean }) {
  const dollhouse = useWorldStore((s) => s.dollhouse);
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
      frameRuntime.wake('wall-fade', 100);
    } else {
      material.opacity = target.current;
    }
  });
  const walls = useMemo<WallBox[]>(
    () =>
      rooms.flatMap((room) => {
        if (room.type === 'booth') {
          return boothPhysical(room).boxes.map((box, index) => ({
            key: `${room.id}:${index}`,
            position: box.position,
            yaw: box.yaw,
            length: box.halfExtents[0] * 2,
            height: box.halfExtents[1] * 2,
            thickness: box.halfExtents[2] * 2,
          }));
        }
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
            thickness: WALL_THICKNESS,
          };
        });
      }),
    [rooms],
  );
  return (
    <group>
      {walls.map((wall) => (
        <mesh
          key={wall.key}
          position={wall.position}
          rotation-y={wall.yaw}
          material={material}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[wall.length, wall.height, wall.thickness]} />
          {!dollhouse && (
            <RigidBody type="fixed" colliders={false}>
              <CuboidCollider args={[wall.length / 2, wall.height / 2, wall.thickness / 2]} />
            </RigidBody>
          )}
        </mesh>
      ))}
    </group>
  );
}
