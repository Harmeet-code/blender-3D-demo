import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';
import type { InstancedMesh } from 'three';
import {
  BufferGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Object3D,
  ShapeUtils,
  Vector2,
} from 'three';
import type {
  AuthoredPoi,
  AuthoredZone,
  Floor,
} from '@/features/building/model/building-schema.ts';
import { authoredWallBoxes } from '@/features/building/model/authored-walls.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { frameRuntime } from '../model/frame-runtime.ts';

function zoneGeometry(zone: AuthoredZone) {
  const points = zone.polygon.map(([x, z]) => new Vector2(x, z));
  const faces = ShapeUtils.triangulateShape(points, []);
  const positions = new Float32Array(points.flatMap(({ x, y }) => [x, 0.025, y]));
  const indices = faces.flatMap(([a = 0, b = 0, c = 0]) => [a, c, b]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // A closed collision prism retains concave zone outlines rather than replacing them with AABBs.
  const vertices = new Float32Array(
    points.flatMap(({ x, y }) => [x, 0, y]).concat(points.flatMap(({ x, y }) => [x, 3, y])),
  );
  const n = points.length;
  const triangles = faces.flatMap(([a = 0, b = 0, c = 0]) => [a, b, c, n + a, n + c, n + b]);
  points.forEach((_, i) => {
    const j = (i + 1) % n;
    triangles.push(i, j, n + j, i, n + j, n + i);
  });
  return { geometry, vertices, triangles: new Uint32Array(triangles) };
}

function Zone({
  zone,
  collidable,
  opacity,
}: {
  zone: AuthoredZone;
  collidable: boolean;
  opacity: number;
}) {
  const data = useMemo(() => zoneGeometry(zone), [zone]);
  useEffect(() => () => data.geometry.dispose(), [data]);
  return (
    <group>
      <mesh geometry={data.geometry} userData={{ zoneId: zone.id }} receiveShadow>
        <meshStandardMaterial
          color={
            zone.type === 'blocked' ? '#cf7970' : zone.type === 'display' ? '#c7a35f' : '#729c8c'
          }
          transparent
          opacity={opacity * 0.12}
          depthWrite={false}
          side={2}
        />
      </mesh>
      {collidable && zone.type === 'blocked' && (
        <RigidBody type="fixed" colliders={false}>
          <TrimeshCollider args={[data.vertices, data.triangles]} />
        </RigidBody>
      )}
    </group>
  );
}

/** instanceId indexes stable POI identity metadata without one draw/material per marker. */
function PoiMarkers({ pois, dimmed }: { pois: AuthoredPoi[]; dimmed: boolean }) {
  const mesh = useRef<InstancedMesh>(null);
  const metadata = useMemo(
    () => ({
      poiIds: pois.map((poi) => poi.id),
      pois: pois.map((poi) => ({ poiId: poi.id, label: poi.label })),
    }),
    [pois],
  );
  useLayoutEffect(() => {
    if (!mesh.current) {
      return;
    }
    const object = new Object3D();
    object.rotation.x = -Math.PI / 2;
    pois.forEach((poi, index) => {
      object.position.set(poi.position[0], 0.12, poi.position[1]);
      object.updateMatrix();
      mesh.current!.setMatrixAt(index, object.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
    mesh.current.computeBoundingBox();
    frameRuntime.wake('authored-pois', 100);
  }, [pois]);
  if (!pois.length) {
    return null;
  }
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, pois.length]}
      userData={metadata}
      receiveShadow
    >
      <ringGeometry args={[0.18, 0.3, 24]} />
      <meshStandardMaterial color="#9b7946" transparent opacity={dimmed ? 0.2 : 0.85} />
    </instancedMesh>
  );
}

/** Normalized meter floor, placed under the same height/animation parent as its floor surface. */
export function AuthoredFeatures({ floor, dimmed = false }: { floor: Floor; dimmed?: boolean }) {
  const dollhouse = useWorldStore((state) => state.dollhouse);
  const walls = floor.authoring?.walls;
  const boxes = useMemo(() => (walls ?? []).flatMap(authoredWallBoxes), [walls]);
  const mesh = useRef<InstancedMesh>(null);
  const material = useMemo(
    () => new MeshStandardMaterial({ color: '#d9d5cd', roughness: 0.78, transparent: true }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    if (!mesh.current) {
      return;
    }
    const object = new Object3D();
    boxes.forEach((box, index) => {
      object.position.set(...box.position);
      object.rotation.set(0, box.yaw, 0);
      object.scale.set(box.halfExtents[0] * 2, box.halfExtents[1] * 2, box.halfExtents[2] * 2);
      object.updateMatrix();
      mesh.current!.setMatrixAt(index, object.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
    frameRuntime.wake('authored-walls', 100);
  }, [boxes]);
  useFrame((_, delta) => {
    const target = dimmed ? 0.2 : 1;
    const next = material.opacity + (target - material.opacity) * Math.min(1, delta * 5);
    if (Math.abs(next - target) > 0.001) {
      material.opacity = next;
      frameRuntime.wake('authored-wall-fade', 100);
    } else {
      material.opacity = target;
    }
  });
  return (
    <group>
      {boxes.length > 0 && (
        <instancedMesh
          ref={mesh}
          args={[undefined, material, boxes.length]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
      {!dollhouse && (
        <RigidBody type="fixed" colliders={false}>
          {boxes.map((box, index) => (
            <CuboidCollider
              key={index}
              position={box.position}
              rotation={[0, box.yaw, 0]}
              args={box.halfExtents}
            />
          ))}
        </RigidBody>
      )}
      {(floor.authoring?.zones ?? []).map((zone) => (
        <Zone key={zone.id} zone={zone} collidable={!dollhouse} opacity={dimmed ? 0.2 : 1} />
      ))}
      {floor.authoring?.pois && <PoiMarkers pois={floor.authoring.pois} dimmed={dimmed} />}
    </group>
  );
}
