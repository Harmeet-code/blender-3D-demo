import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { Mesh } from 'three';
import { Group, Vector3, type Object3D } from 'three';
import { useActiveLayout } from '@/features/building/model/active-layout.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { frameRuntime } from '@/features/world/model/frame-runtime.ts';
import { useReducedMotion } from '@/features/world/hooks/use-reduced-motion.ts';
import { useRoutePlanner, type RoutePlan } from '../model/route-planner.ts';

interface PreviewLeg {
  floorId: string;
  points: Array<[number, number, number]>;
  distances: number[];
  offset: number;
  length: number;
}
function splitRoute(plan: RoutePlan) {
  const legs: PreviewLeg[] = [];
  let total = 0;
  for (let i = 0; i < plan.route.points.length; i++) {
    const point = plan.route.points[i]!;
    const floorId = plan.route.floors[i] ?? plan.from.floorId;
    let leg = legs.at(-1);
    if (!leg || leg.floorId !== floorId) {
      leg = { floorId, points: [], distances: [], offset: total, length: 0 };
      legs.push(leg);
    }
    const next: [number, number, number] = [point[0], point[1] - 1.05, point[2]];
    const previous = leg.points.at(-1);
    const distance = previous
      ? Math.hypot(next[0] - previous[0], next[1] - previous[1], next[2] - previous[2])
      : 0;
    if (previous && distance < 0.0001) {
      continue;
    }
    total += distance;
    leg.length += distance;
    leg.points.push(next);
    leg.distances.push(leg.length);
  }
  return { legs, total };
}

function PreviewFloorLeg({
  leg,
  total,
  plan,
  reducedMotion,
}: {
  leg: PreviewLeg;
  total: number;
  plan: RoutePlan;
  reducedMotion: boolean;
}) {
  const root = useRef<Group>(null);
  const dot = useRef<Mesh>(null);
  const floorNode = useRef<Object3D | null>(null);
  const started = useRef(0);
  const scene = useThree((state) => state.scene);
  const height = plan.layout.floors.find((floor) => floor.id === leg.floorId)?.heightOffset ?? 0;
  const floorWorld = useMemo(() => new Vector3(), []);
  useEffect(() => {
    floorNode.current = null;
    scene.traverse((object) => {
      if (
        !floorNode.current &&
        object instanceof Group &&
        object.userData.floorId === leg.floorId
      ) {
        floorNode.current = object;
      }
    });
    started.current = performance.now();
  }, [scene, leg, plan]);
  useFrame(() => {
    if (root.current && floorNode.current) {
      // Follow actual animated dollhouse transforms rather than jumping to final offsets.
      floorNode.current.getWorldPosition(floorWorld);
      root.current.position.y = floorWorld.y - height;
    }
    if (!dot.current) {
      return;
    }
    const phase = reducedMotion ? 1 : Math.min(1, (performance.now() - started.current) / 3000);
    const progress = total * phase - leg.offset;
    dot.current.visible = progress >= 0 && progress <= leg.length;
    if (!dot.current.visible || leg.points.length === 0) {
      return;
    }
    if (leg.points.length === 1) {
      dot.current.position.set(...leg.points[0]!);
      return;
    }
    let low = 1;
    let high = leg.distances.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (leg.distances[middle]! < progress) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    const a = leg.points[low - 1]!;
    const b = leg.points[low]!;
    const length = leg.distances[low]! - leg.distances[low - 1]!;
    const t =
      length > 0 ? Math.min(1, Math.max(0, (progress - leg.distances[low - 1]!) / length)) : 0;
    dot.current.position.set(a[0] + (b[0] - a[0]) * t, a[1] + 0.14, a[2] + (b[2] - a[2]) * t);
  });
  const first = leg.points[0];
  const last = leg.points.at(-1);
  return (
    <group ref={root} name={`route-preview:${leg.floorId}`}>
      {leg.points.length > 1 && (
        <>
          <Line
            points={leg.points}
            color="#38bdf8"
            lineWidth={10}
            transparent
            opacity={0.14}
            depthWrite={false}
            toneMapped={false}
          />
          <Line
            points={leg.points}
            color="#7dd3fc"
            lineWidth={3}
            depthWrite={false}
            toneMapped={false}
          />
        </>
      )}
      {first && (
        <mesh position={first}>
          <cylinderGeometry args={[0.4, 0.4, 0.04, 20]} />
          <meshBasicMaterial color="#38bdf8" toneMapped={false} />
        </mesh>
      )}
      {last && (
        <mesh position={last}>
          <cylinderGeometry args={[0.4, 0.4, 0.04, 20]} />
          <meshBasicMaterial color="#fbbf24" toneMapped={false} />
        </mesh>
      )}
      <mesh ref={dot} visible={false}>
        <sphereGeometry args={[0.2, 12, 8]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Bounded reveal animation settles back to the existing demand-render idle state. */
export function RoutePreview() {
  const plan = useRoutePlanner((state) => state.plan);
  const layout = useActiveLayout();
  const currentFloor = useWorldStore((state) => state.currentFloorId);
  const dollhouse = useWorldStore((state) => state.dollhouse);
  const reducedMotion = useReducedMotion();
  const split = useMemo(() => (plan ? splitRoute(plan) : null), [plan]);
  useEffect(() => {
    if (plan && plan.layout === layout) {
      frameRuntime.wake('route-preview-reveal', reducedMotion ? 50 : 3200);
    }
    return () => frameRuntime.release('route-preview-reveal');
  }, [plan, layout, reducedMotion]);
  if (!plan || plan.layout !== layout || !split) {
    return null;
  }
  return (
    <group name="route-preview">
      {split.legs.map((leg, index) => (
        <group key={`${index}:${leg.floorId}`} visible={dollhouse || leg.floorId === currentFloor}>
          <PreviewFloorLeg
            leg={leg}
            total={split.total}
            plan={plan}
            reducedMotion={reducedMotion}
          />
        </group>
      ))}
    </group>
  );
}
