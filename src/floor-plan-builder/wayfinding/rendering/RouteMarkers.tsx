import { useLayoutEffect, useMemo, useRef } from 'react';
import { DoubleSide, Object3D, type InstancedMesh } from 'three';
import { buildRibbonGeometry, tickPositions } from './ribbon-geometry.ts';
import { Beacon, RouteLabel } from './Beacon.tsx';

export interface MarkerInput {
  point: [number, number];
  yaw: number;
  distance: number;
}
function useTurns(points: [number, number][]) {
  return useMemo(() => {
    const turns: MarkerInput[] = [];
    let distance = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1]!,
        b = points[i]!,
        c = points[i + 1]!;
      distance += Math.hypot(b[0] - a[0], b[1] - a[1]);
      const before = Math.atan2(b[1] - a[1], b[0] - a[0]),
        after = Math.atan2(c[1] - b[1], c[0] - b[0]);
      const turn = Math.atan2(Math.sin(after - before), Math.cos(after - before));
      if (Math.abs(turn) >= 0.35) {
        turns.push({ point: b, yaw: Math.atan2(c[0] - b[0], c[1] - b[1]), distance });
      }
    }
    return turns;
  }, [points]);
}
function GroundMarks({
  rows,
  y,
  arrows,
  topDown,
}: {
  rows: MarkerInput[];
  y: number;
  arrows: boolean;
  topDown: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) {
      return;
    }
    const dummy = new Object3D();
    dummy.rotation.order = 'YXZ';
    rows.forEach((row, index) => {
      dummy.position.set(row.point[0], y, row.point[1]);
      dummy.rotation.set(arrows ? Math.PI / 2 : 0, row.yaw, 0);
      dummy.updateMatrix();
      ref.current!.setMatrixAt(index, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [rows, y, arrows]);
  if (!rows.length) {
    return null;
  }
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, rows.length]}
      renderOrder={23}
      raycast={() => {}}
    >
      {arrows ? (
        <coneGeometry args={[0.18, 0.45, 3]} />
      ) : (
        <boxGeometry args={[0.64, 0.018, 0.075]} />
      )}
      <meshBasicMaterial
        color="#F8F9FA"
        toneMapped={false}
        transparent
        opacity={0.95}
        depthWrite={false}
        depthTest={!topDown}
      />
    </instancedMesh>
  );
}

export function RouteMarkers({
  points,
  y = 0.05,
  start,
  dest,
  floorBadges = [],
  beaconAnimated = true,
  topDown = false,
  startDistance = 0,
  showLabels = true,
}: {
  points: [number, number][];
  y?: number;
  start: [number, number] | null;
  dest: { point: [number, number]; label: string } | null;
  floorBadges?: {
    at: [number, number, number];
    floorName: string;
    continues: boolean;
    kind?: string;
  }[];
  beaconAnimated?: boolean;
  topDown?: boolean;
  startDistance?: number;
  showLabels?: boolean;
}) {
  const turns = useTurns(points);
  const ticks = useMemo(() => {
    const data = buildRibbonGeometry(points, 0, 0.5);
    return data ? tickPositions(data.samples, 10, startDistance) : [];
  }, [points, startDistance]);
  return (
    <group name="RouteMarkers">
      <GroundMarks rows={ticks} y={y + 0.015} arrows={false} topDown={topDown} />
      <GroundMarks rows={turns} y={y + 0.03} arrows topDown={topDown} />
      {showLabels &&
        ticks.map((tick) => (
          <RouteLabel
            key={tick.distance}
            text={`${tick.distance.toFixed(0)} m`}
            at={[
              tick.point[0] + Math.cos(tick.yaw) * 0.8,
              y + 0.15,
              tick.point[1] - Math.sin(tick.yaw) * 0.8,
            ]}
          />
        ))}
      {start && (
        <group position={[start[0], y, start[1]]}>
          <mesh
            position={[0, 0.25, 0]}
            rotation={[Math.PI, 0, 0]}
            renderOrder={22}
            raycast={() => {}}
          >
            <coneGeometry args={[0.18, 0.45, 16]} />
            <meshBasicMaterial color="#10B981" toneMapped={false} depthTest={!topDown} />
          </mesh>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.02, 0]}
            renderOrder={22}
            raycast={() => {}}
          >
            <ringGeometry args={[0.3, 0.42, 24]} />
            <meshBasicMaterial
              color="#10B981"
              toneMapped={false}
              transparent
              opacity={0.9}
              depthWrite={false}
              depthTest={!topDown}
              side={DoubleSide}
            />
          </mesh>
          {showLabels && (
            <RouteLabel text="START" color="#6EE7B7" at={[0, topDown ? 0.1 : 0.9, -0.65]} />
          )}
        </group>
      )}
      {dest && (
        <Beacon
          at={[dest.point[0], y, dest.point[1]]}
          label={dest.label}
          animated={beaconAnimated}
          topDown={topDown}
          showLabel={showLabels}
        />
      )}
      {floorBadges.map((badge, index) => (
        <group key={index} position={badge.at}>
          <mesh
            position={[0, 0.08, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={23}
            raycast={() => {}}
          >
            <ringGeometry args={[0.25, 0.38, 4]} />
            <meshBasicMaterial
              color="#06B6D4"
              toneMapped={false}
              depthTest={!topDown}
              side={DoubleSide}
            />
          </mesh>
          {showLabels && (
            <RouteLabel
              text={`${badge.kind === 'elevator' ? '↕' : badge.kind === 'ramp' ? '↗' : '▰'} ${badge.kind && badge.kind !== 'walk' ? badge.kind : 'Connector'} · ${badge.continues ? 'Continues on ' : ''}${badge.floorName}`}
              color="#67E8F9"
              at={[0, topDown ? 0.15 : 1.6, -0.7]}
            />
          )}
        </group>
      ))}
    </group>
  );
}
