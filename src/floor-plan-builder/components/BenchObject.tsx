import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Line } from '@react-three/drei';
import { CatmullRomCurve3, Color, Object3D, Vector3, type Group, type InstancedMesh } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BENCH_SEAT_HEIGHT, benchSeatsLocal } from '../model/bench.ts';
import type { PlanObject } from '../model/types.ts';

const FRAME = { roughness: 0.4, metalness: 0.8 };
const WOOD = { roughness: 0.65, metalness: 0 };

function Slats({
  rows,
  size,
  ghost,
  tint,
}: {
  rows: [number, number, number][];
  size: readonly [number, number, number];
  ghost: boolean;
  tint?: string;
}) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(
    () => new RoundedBoxGeometry(size[0], size[1], size[2], 1, 0.005),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [size[0], size[1], size[2]],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const dummy = new Object3D();
    const color = new Color();
    rows.forEach((point, index) => {
      dummy.position.set(...point);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, color.set(tint ?? '#9A3412'));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
  }, [rows, tint]);
  if (!rows.length) {
    return null;
  }
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, rows.length]} castShadow receiveShadow>
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial {...WOOD} transparent={ghost} opacity={ghost ? 0.45 : 1} />
    </instancedMesh>
  );
}

export function BenchObject({
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
  const [w, , d] = object.dimensions;
  const backed = object.benchVariant === 'backed';
  const root = useRef<Group>(null);
  const near: boolean = true;

  const opacity = ghost ? 0.45 : 1;
  const slatLen = w - 0.1;
  const seats = useMemo(() => {
    const pitch = Math.min(0.09, (d - 0.08) / 5);
    const rows: [number, number, number][] = [];
    for (let i = 0; i < 6; i++) {
      rows.push([0, BENCH_SEAT_HEIGHT, (i - 2.5) * pitch]);
    }
    return rows;
  }, [d]);
  const backRows = useMemo(() => {
    if (!backed) {
      return [];
    }
    const rows: [number, number, number][] = [];
    for (let i = 0; i < 4; i++) {
      const y = 0.65 + i * 0.067;
      rows.push([0, y, -d / 2 - 0.02 - (y - BENCH_SEAT_HEIGHT) * 0.27]);
    }
    return rows;
  }, [backed, d]);
  const armCurve = useMemo(
    () =>
      new CatmullRomCurve3([
        new Vector3(0, 0.45, d / 2 - 0.04),
        new Vector3(0, 0.68, d / 2 - 0.06),
        new Vector3(0, 0.68, -(d / 2 - 0.04)),
      ]),
    [d],
  );
  const sitNodes = benchSeatsLocal(object);

  if (!near && !topDown) {
    return (
      <group ref={root} name="BenchFar">
        <mesh position={[0, 0.225, 0]} castShadow>
          <boxGeometry args={[w, 0.45, d]} />
          <meshStandardMaterial color="#9A3412" {...WOOD} transparent={ghost} opacity={opacity} />
        </mesh>
        {backed && (
          <mesh position={[0, 0.65, -d / 2 - 0.05]} rotation={[0.26, 0, 0]} castShadow>
            <boxGeometry args={[w, 0.4, 0.06]} />
            <meshStandardMaterial color="#9A3412" {...WOOD} transparent={ghost} opacity={opacity} />
          </mesh>
        )}
      </group>
    );
  }

  return (
    <group ref={root} name="VenueBench">
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (w / 2 - 0.05), 0.425, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.06, 0.85, d]} />
          <meshStandardMaterial color="#1E2022" {...FRAME} transparent={ghost} opacity={opacity} />
        </mesh>
      ))}
      <Slats rows={seats} size={[slatLen, 0.03, 0.08]} ghost={ghost} />
      {backed && (
        <>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * (w / 2 - 0.05), 0.65, -d / 2 - 0.06]}
              rotation={[0.26, 0, 0]}
              castShadow
            >
              <boxGeometry args={[0.06, 0.5, 0.06]} />
              <meshStandardMaterial
                color="#1E2022"
                {...FRAME}
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
          ))}
          <Slats rows={backRows} size={[slatLen, 0.03, 0.08]} ghost={ghost} />
        </>
      )}
      {[-1, 1].map((side) => (
        <mesh key={`arm-${side}`} position={[side * (w / 2 - 0.05), 0, 0]} castShadow>
          <tubeGeometry args={[armCurve, 16, 0.02, 8]} />
          <meshStandardMaterial color="#1E2022" {...FRAME} transparent={ghost} opacity={opacity} />
        </mesh>
      ))}
      {near &&
        !ghost &&
        seats.flatMap(([, y, z], index) =>
          [-1, 1].map((side) => (
            <mesh key={`${index}:${side}`} position={[side * (w / 2 - 0.08), y + 0.005, z]}>
              <cylinderGeometry args={[0.012, 0.012, 0.008, 6]} />
              <meshStandardMaterial color="#C0C4C8" roughness={0.25} metalness={0.85} />
            </mesh>
          )),
        )}
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
            color="#9A3412"
            lineWidth={2}
          />
          {seats.map(([, , z], index) => (
            <Line
              key={index}
              points={[
                [-slatLen / 2, 0.1, z],
                [slatLen / 2, 0.1, z],
              ]}
              color="#9A3412"
              lineWidth={1}
            />
          ))}
          {[-1, 1].map((side) => (
            <mesh key={`cap-${side}`} position={[side * (w / 2 - 0.05), 0.05, 0]}>
              <boxGeometry args={[0.06, 0.02, d]} />
              <meshBasicMaterial color="#1E2022" toneMapped={false} />
            </mesh>
          ))}
          {sitNodes.map((node, index) => (
            <mesh
              key={`sit-${index}`}
              position={[node.at[0], 0.05, node.at[1] + 0.1]}
              rotation={[Math.PI / 2, 0, -node.yaw]}
            >
              <coneGeometry args={[0.09, 0.2, 3]} />
              <meshBasicMaterial
                color="#06B6D4"
                toneMapped={false}
                transparent
                opacity={0.9}
                side={2}
              />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}
