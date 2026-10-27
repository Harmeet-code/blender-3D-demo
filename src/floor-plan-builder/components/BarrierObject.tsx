import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import {
  BufferGeometry,
  Float32BufferAttribute,
  Object3D,
  Vector3,
  type Group,
  type InstancedMesh,
} from 'three';
import { BARRIER_POST_RADIUS, barrierBeltColor } from '../model/barrier.ts';
import type { PlanObject } from '../model/types.ts';

/**
 * Belt ribbon with symmetric catenary sag. The spec formula
 * y = Y − sag·(1−cos(πz/L)) drops 2·sag at the far end; the symmetric
 * y = Y − sag·(1−cos(2πz/L))/2 used here attaches at head height on both
 * posts with full sag mid-span.
 */
function beltGeometry(length: number, headY: number, sag: number): BufferGeometry {
  const segments = Math.max(8, Math.round(length * 8));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = -length / 2 + t * length;
    const y = headY - (sag * (1 - Math.cos(2 * Math.PI * t))) / 2;
    positions.push(x, y - 0.025, 0, x, y + 0.025, 0);
    uvs.push(t, 0, t, 1);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function Posts({ w, ghost }: { w: number; ghost: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const dummy = new Object3D();
    [-w / 2, w / 2].forEach((x, index) => {
      dummy.position.set(x, 0.475, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [w]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 2]} castShadow>
      <cylinderGeometry args={[0.035, 0.035, 0.95, 12]} />
      <meshStandardMaterial
        color="#C0C4C8"
        roughness={0.2}
        metalness={0.85}
        transparent={ghost}
        opacity={ghost ? 0.45 : 1}
      />
    </instancedMesh>
  );
}

export function BarrierObject({
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
  const [w] = object.dimensions;
  const root = useRef<Group>(null);
  const [near, setNear] = useState(true);
  const world = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    if (!root.current) {
      return;
    }
    root.current.getWorldPosition(world);
    const distance = camera.position.distanceTo(world);
    if (near && distance > 14) {
      setNear(false);
    } else if (!near && distance < 11) {
      setNear(true);
    }
  });

  const beltColor = barrierBeltColor(object);
  const belt = useMemo(() => beltGeometry(w, 0.9, object.barrierSag), [w, object.barrierSag]);
  useEffect(() => () => belt.dispose(), [belt]);
  const opacity = ghost ? 0.45 : 1;

  if (!near && !topDown) {
    return (
      <group ref={root} name="BarrierFar">
        {[-w / 2, w / 2].map((x) => (
          <mesh key={x} position={[x, 0.475, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.95, 6]} />
            <meshStandardMaterial
              color="#C0C4C8"
              roughness={0.2}
              metalness={0.85}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
        ))}
        <mesh position={[0, 0.9, 0]}>
          <planeGeometry args={[w, 0.05]} />
          <meshStandardMaterial
            color={beltColor}
            roughness={0.8}
            transparent={ghost}
            opacity={opacity}
            side={2}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={root} name="BeltBarrier">
      {[-w / 2, w / 2].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.015, 0]} receiveShadow>
            <cylinderGeometry args={[BARRIER_POST_RADIUS, BARRIER_POST_RADIUS, 0.03, 20]} />
            <meshStandardMaterial
              color="#C0C4C8"
              roughness={0.2}
              metalness={0.85}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
          {near && (
            <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[BARRIER_POST_RADIUS, BARRIER_POST_RADIUS + 0.02, 20]} />
              <meshStandardMaterial
                color="#20252A"
                roughness={1}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
          )}
          <mesh position={[0, 0.95, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.12, 12]} />
            <meshStandardMaterial
              color="#1E2022"
              roughness={0.4}
              metalness={0.6}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
          {near &&
            [0, Math.PI / 2, Math.PI, -Math.PI / 2].map((yaw) => (
              <mesh
                key={yaw}
                position={[Math.sin(yaw) * 0.05, 0.95, Math.cos(yaw) * 0.05]}
                rotation={[0, yaw, 0]}
              >
                <boxGeometry args={[0.02, 0.04, 0.012]} />
                <meshStandardMaterial color="#0B0E11" roughness={0.7} />
              </mesh>
            ))}
        </group>
      ))}
      <Posts w={w} ghost={ghost} />
      <mesh geometry={belt} castShadow>
        <meshStandardMaterial
          color={beltColor}
          roughness={0.8}
          transparent={ghost}
          opacity={opacity}
          side={2}
        />
      </mesh>
      {near && !ghost && (
        <mesh position={[w / 2 - 0.03, 0.88, 0]} castShadow>
          <boxGeometry args={[0.03, 0.07, 0.03]} />
          <meshStandardMaterial color="#1E2022" roughness={0.4} metalness={0.6} />
        </mesh>
      )}
      {topDown && (
        <>
          {[-w / 2, w / 2].map((x) => (
            <mesh key={x} position={[x, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[BARRIER_POST_RADIUS, 16]} />
              <meshBasicMaterial color="#C0C4C8" toneMapped={false} />
            </mesh>
          ))}
          <Line
            points={[
              [-w / 2, 0.1, 0],
              [w / 2, 0.1, 0],
            ]}
            color={beltColor}
            lineWidth={3}
          />
        </>
      )}
    </group>
  );
}
