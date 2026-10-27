import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Object3D, type InstancedMesh } from 'three';
import { pointInPolygon, polygonEdges, segmentDistance } from '@/utils/geometry/polygon.ts';
import type { PlanDocument } from '../../model/types.ts';
import { staticBlockers } from '../../model/geometry.ts';
import { usePlaybackStore } from '../store/playback-store.ts';
import { buildFloorNavInput } from '../navigation/input-builder.ts';
import type { WalkableZone } from '../model/zone-schema.ts';
import type { Follower } from '../walkthrough/follower.ts';
import { sampleLeg, type Vec3 } from '../walkthrough/path.ts';

/** Two draw calls for all humanoids; the existing worker funnel supplies every wander path. */
export function AmbientNPCs({
  runtime,
  document,
  floorId,
  originY,
  count,
  zones,
  population,
}: {
  runtime: Follower;
  document: PlanDocument;
  floorId: string;
  originY: number;
  count: number;
  zones: WalkableZone[];
  population: { npcs: number };
}) {
  const heads = useRef<InstancedMesh>(null),
    bodies = useRef<InstancedMesh>(null);
  const paths = useMemo(() => {
    const floor = document.floors.find((item) => item.source.id === floorId);
    if (!floor) {
      return [];
    }
    const input = buildFloorNavInput(floorId, floor.boundary, zones, floor.objects, false);
    const polygons = [
      ...input.obstacles,
      ...staticBlockers(floor),
      ...floor.zones.filter((z) => z.type === 'blocked').map((z) => z.polygon),
    ];
    const edges = polygons.flatMap(polygonEdges);
    const point: [number, number] = [0, 0],
      position: Vec3 = [0, 0, 0],
      tangent: Vec3 = [0, 0, 0];
    return runtime.path.legs.filter((leg) => {
      if (leg.kind !== 'walk' || leg.floorId !== floorId || leg.length < 2) {
        return false;
      }
      for (let s = 0; s <= leg.length; s += 0.2) {
        sampleLeg(leg, s, position, tangent);
        [point[0], , point[1]] = position;
        if (
          !input.surfaces.some((poly) => pointInPolygon(point, poly)) ||
          polygons.some((poly) => pointInPolygon(point, poly)) ||
          edges.some(([a, b]) => segmentDistance(point, a, b) < 0.4)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [runtime, document, floorId, zones]);
  const actualCount = Math.min(
    count,
    Math.floor(paths.reduce((sum, path) => sum + path.length, 0) / 2),
  );
  const dummy = useMemo(() => new Object3D(), []),
    clock = useRef(0);
  const position: Vec3 = useMemo(() => [0, 0, 0], []),
    tangent: Vec3 = useMemo(() => [0, 0, 0], []);
  useEffect(() => {
    const color = new Color();
    for (let i = 0; i < count; i++) {
      heads.current?.setColorAt(i, color.set('#D8AE87'));
      color.setHSL((i * 0.618) % 1, 0.45, 0.42);
      for (let part = 0; part < 5; part++) {
        bodies.current?.setColorAt(i * 5 + part, color);
      }
    }
    if (heads.current?.instanceColor) {
      heads.current.instanceColor.needsUpdate = true;
    }
    if (bodies.current?.instanceColor) {
      bodies.current.instanceColor.needsUpdate = true;
    }
  }, [count, paths]);
  useFrame((_, dt) => {
    const state = usePlaybackStore.getState();
    if (state.status === 'playing' && !window.document.hidden) {
      clock.current += Math.min(dt, 0.1) * state.speed;
    }
    if (!heads.current || !bodies.current) {
      return;
    }
    heads.current.count = actualCount;
    bodies.current.count = actualCount * 5;
    if (population) {
      population.npcs = actualCount;
    }
    for (let i = 0; i < actualCount; i++) {
      const leg = paths[i % paths.length]!,
        travel =
          (clock.current * (0.6 + (i % 4) * 0.1) +
            leg.length * 2 * ((i * 0.61803398875 + 0.15) % 1)) %
          (leg.length * 2);
      const forward = travel <= leg.length,
        s = forward ? travel : leg.length * 2 - travel;
      sampleLeg(leg, s, position, tangent);
      const lane = forward ? 0.1 : -0.1;
      position[0] += tangent[2] * lane;
      position[2] -= tangent[0] * lane;
      const yaw = Math.atan2(-tangent[0], -tangent[2]) + (forward ? 0 : Math.PI),
        gait = Math.sin((clock.current + i) * 7) * 0.32;
      dummy.position.set(position[0], position[1] + originY + 1.62, position[2]);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      heads.current.setMatrixAt(i, dummy.matrix);
      for (let part = 0; part < 5; part++) {
        const side = part % 2 ? 1 : -1,
          arm = part > 2,
          localX = part === 0 ? 0 : side * (arm ? 0.22 : 0.1),
          localY = part === 0 ? 1.12 : arm ? 1.22 : 0.42;
        dummy.position.set(
          position[0] + Math.cos(yaw) * localX,
          position[1] + originY + localY,
          position[2] - Math.sin(yaw) * localX,
        );
        dummy.rotation.set(part === 0 ? 0 : gait * side * (arm ? -1 : 1), yaw, 0);
        dummy.scale.set(
          part === 0 ? 0.17 : arm ? 0.035 : 0.05,
          part === 0 ? 0.7 : arm ? 0.35 : 0.75,
          part === 0 ? 0.15 : 0.04,
        );
        dummy.updateMatrix();
        bodies.current.setMatrixAt(i * 5 + part, dummy.matrix);
      }
    }
    heads.current.instanceMatrix.needsUpdate = true;
    bodies.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group name="AmbientCrowd">
      <instancedMesh
        ref={heads}
        args={[undefined, undefined, count]}
        frustumCulled={false}
        raycast={() => {}}
        castShadow
      >
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh
        ref={bodies}
        args={[undefined, undefined, count * 5]}
        frustumCulled={false}
        raycast={() => {}}
        castShadow
      >
        <cylinderGeometry args={[1, 0.9, 1, 8]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
    </group>
  );
}
