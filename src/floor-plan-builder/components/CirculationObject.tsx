import { useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { TraversalMotionContext } from '../wayfinding/walkthrough/motion-context.tsx';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group, InstancedMesh } from 'three';
import { Object3D } from 'three';
import type { PlanObject } from '../model/types.ts';
import { CirculationFar } from './CirculationFar.tsx';
import {
  circulationDesign,
  circulationMetrics,
  circulationSpans,
  circulationError,
  type CirculationSpan,
} from '../model/circulation.ts';
import {
  CirculationAppearance,
  Boxes,
  Part,
  Rail,
  Rods,
  Sign,
  Surface,
  useCirculationTexture,
  type V3,
} from './CirculationParts.tsx';

function Incline({
  span,
  width,
  thickness,
  offset = 0,
  color,
  glass = false,
  ...surface
}: {
  span: CirculationSpan;
  width: number;
  thickness: number;
  offset?: number;
  color?: string;
  glass?: boolean;
} & Parameters<typeof Surface>[0]) {
  const dz = span.to - span.from,
    dy = span.y1 - span.y0;
  return (
    <Part
      size={[width, thickness, Math.hypot(dz, dy)]}
      at={[span.x, (span.y0 + span.y1) / 2 + offset, (span.from + span.to) / 2]}
      rotation={[-Math.atan2(dy, dz), 0, 0]}
      color={color}
      glass={glass}
      {...surface}
    />
  );
}
function FlightRails({
  span,
  ramp,
  near,
}: {
  span: CirculationSpan;
  ramp: boolean;
  near: boolean;
}) {
  const d = Math.sign(span.to - span.from),
    count = Math.ceil(Math.abs(span.to - span.from) / (near ? (ramp ? 1.2 : 0.12) : 1.5));
  const rods = useMemo(
    () =>
      [-1, 1].flatMap((side) =>
        Array.from({ length: count + 1 }, (_, i): [V3, V3] => {
          const t = i / count,
            x = span.x + side * (span.width / 2 - 0.03),
            y = span.y0 + (span.y1 - span.y0) * t,
            z = span.from + (span.to - span.from) * t;
          return [
            [x, y, z],
            [x, y + (ramp ? 0.86 : 0.9), z],
          ];
        }),
      ),
    [span, count, ramp],
  );
  const newels = useMemo(
    () =>
      [-1, 1].flatMap((side) =>
        [0, 1].map((t): [V3, V3] => {
          const x = span.x + side * (span.width / 2 - 0.03),
            y = t ? span.y1 : span.y0,
            z = t ? span.to : span.from;
          return [
            [x, y, z],
            [x, y + (ramp ? 0.86 : 1), z],
          ];
        }),
      ),
    [span, ramp],
  );
  return (
    <>
      <Rods rows={rods} radius={ramp ? 0.018 : 0.008} />
      <Rods rows={newels} radius={0.03} />
      {[-1, 1].flatMap((side) =>
        (ramp ? [0.86, 0.68] : [0.9]).map((height) => {
          const x = span.x + side * (span.width / 2 - 0.03);
          return (
            <Rail
              key={`${side}:${height}`}
              radius={ramp ? 0.02 : 0.025}
              points={[
                [x, span.y0 + height - 0.04, span.from - d * 0.32],
                [x, span.y0 + height, span.from - d * 0.25],
                [x, span.y0 + height, span.from],
                [x, span.y1 + height, span.to],
                [x, span.y1 + height, span.to + d * 0.25],
                [x, span.y1 + height - 0.04, span.to + d * 0.32],
              ]}
            />
          );
        }),
      )}
    </>
  );
}
function StairFlight({ span, yellow }: { span: CirculationSpan; yellow: boolean }) {
  const { near } = useContext(CirculationAppearance),
    count = Math.max(1, span.steps - 1),
    going = Math.abs(span.to - span.from) / count,
    riser = (span.y1 - span.y0) / span.steps,
    direction = Math.sign(span.to - span.from);
  const grip = useCirculationTexture('grip');
  const treads = useMemo(
    () =>
      Array.from({ length: count }, (_, i): V3 => [
        span.x,
        span.y0 + (i + 1) * riser - 0.02,
        span.from + direction * (i + 0.5) * going,
      ]),
    [span, count, riser, direction, going],
  );
  const strips = useMemo(
    () => treads.map(([x, y, z]): V3 => [x, y + 0.0225, z - direction * (going / 2 - 0.005)]),
    [treads, direction, going],
  );
  const bolts = useMemo(
    () =>
      [-1, 1].flatMap((side) =>
        [span.from, span.to].map((z): V3 => [
          span.x + side * (span.width / 2 - 0.075),
          z === span.from ? span.y0 + 0.035 : span.y1 + 0.035,
          z,
        ]),
      ),
    [span],
  );
  return (
    <>
      <Boxes
        rows={treads}
        size={[span.width, 0.04, going + 0.02]}
        color="#1E2022"
        roughness={0.95}
        metalness={0}
        bumpMap={grip}
      />
      <Boxes
        rows={strips}
        size={[span.width, 0.005, 0.03]}
        color={yellow ? '#F59E0B' : '#10B981'}
        roughness={0.8}
        metalness={0}
        bumpMap={grip}
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Incline
            span={{ ...span, x: span.x + side * (span.width / 2 - 0.025) }}
            width={0.05}
            thickness={0.2}
            offset={-0.1}
          />
          <Part
            size={[0.16, 0.025, 0.25]}
            at={[span.x + side * (span.width / 2 - 0.075), span.y0 + 0.0125, span.from]}
          />
        </group>
      ))}
      {near &&
        bolts.map((p, i) => (
          <mesh key={i} position={p}>
            <cylinderGeometry args={[0.018, 0.018, 0.018, 6]} />
            <Surface />
          </mesh>
        ))}
    </>
  );
}
function FixedFlights({ object }: { object: PlanObject }) {
  const m = circulationMetrics(object),
    design = circulationDesign(object),
    ramp = object.recipe === 'ramp',
    { near } = useContext(CirculationAppearance);
  const spans = useMemo(
    () => circulationSpans(object),
    [object.dimensions, object.steps, object.circulationDesign],
  );
  const grip = useCirculationTexture('grip');
  const landings: { x: number; y: number; z: number; width: number; depth: number }[] = spans.length
    ? [
        {
          x: spans[0]!.x,
          y: 0,
          z: spans[0]!.from + m.landing / 2,
          width: m.clearWidth,
          depth: m.landing,
        },
        ...spans.map((span, i) => ({
          x: i === spans.length - 1 ? span.x : design.layout === 'switchback' ? 0 : span.x,
          y: span.y1,
          z:
            design.layout === 'switchback' && i === spans.length - 1
              ? (span.to + m.depth / 2) / 2
              : span.to + (Math.sign(span.to - span.from) * m.landing) / 2,
          depth:
            design.layout === 'switchback' && i === spans.length - 1
              ? m.depth / 2 - span.to
              : m.landing,
          width: i < spans.length - 1 && design.layout === 'switchback' ? m.width : m.clearWidth,
        })),
      ]
    : [];
  return (
    <>
      {landings.map((l, i) => (
        <group key={i}>
          <Part
            size={[l.width, 0.05, l.depth]}
            at={[l.x, l.y - 0.025, l.z]}
            color={ramp ? '#334155' : '#1E2022'}
            roughness={0.95}
            metalness={0}
            bumpMap={grip}
          />
          {object.handrails &&
            [-1, 1].map((side) => (
              <group key={side}>
                <Part
                  size={[0.05, 0.08, l.depth]}
                  at={[l.x + side * (l.width / 2 - 0.025), l.y + 0.04, l.z]}
                  color="#1E2022"
                />
                <Rail
                  radius={0.02}
                  points={[
                    [
                      l.x + side * (l.width / 2 - 0.03),
                      l.y + (ramp ? 0.86 : 0.9),
                      l.z - l.depth / 2,
                    ],
                    [
                      l.x + side * (l.width / 2 - 0.03),
                      l.y + (ramp ? 0.86 : 0.9),
                      l.z + l.depth / 2,
                    ],
                  ]}
                />
                <Rods
                  radius={0.03}
                  rows={[-1, 1].map((end): [V3, V3] => [
                    [l.x + side * (l.width / 2 - 0.03), l.y, l.z + end * (l.depth / 2 - 0.03)],
                    [
                      l.x + side * (l.width / 2 - 0.03),
                      l.y + (ramp ? 0.86 : 0.9),
                      l.z + end * (l.depth / 2 - 0.03),
                    ],
                  ])}
                />
                {ramp && (
                  <Rail
                    radius={0.02}
                    points={[
                      [l.x + side * (l.width / 2 - 0.03), l.y + 0.68, l.z - l.depth / 2],
                      [l.x + side * (l.width / 2 - 0.03), l.y + 0.68, l.z + l.depth / 2],
                    ]}
                  />
                )}
              </group>
            ))}
          {design.showLandings && (
            <Sign
              text={i === 0 && ramp ? 'ACCESS' : i === 0 ? 'STAIRS (NON-ACCESSIBLE)' : '↑'}
              at={[l.x, l.y + 0.008, l.z]}
              size={[Math.min(ramp ? 0.85 : 1.8, l.width - 0.12), 0.55]}
              flat
              color={ramp ? '#38BDF8' : '#10B981'}
            />
          )}
          {object.handrails &&
            design.layout === 'switchback' &&
            i === 1 &&
            (ramp ? [0.86, 0.68] : [0.9]).map((height) => (
              <Rail
                key={height}
                radius={0.02}
                points={[
                  [-m.width / 2 + 0.03, l.y + height, -m.depth / 2 + 0.03],
                  [m.width / 2 - 0.03, l.y + height, -m.depth / 2 + 0.03],
                ]}
              />
            ))}
        </group>
      ))}
      {spans.map((span, i) => (
        <group key={i}>
          {ramp ? (
            <>
              <Incline
                span={span}
                width={span.width}
                thickness={0.05}
                offset={-0.025}
                color="#334155"
                roughness={0.95}
                metalness={0}
                bumpMap={grip}
              />
              {[-1, 1].map((side) => (
                <group key={side}>
                  <Incline
                    span={{ ...span, x: span.x + side * (span.width / 2 - 0.025) }}
                    width={0.05}
                    thickness={0.08}
                    offset={0.04}
                    color="#1E2022"
                  />
                  <Incline
                    span={{ ...span, x: span.x + side * (span.width / 2 - 0.075) }}
                    width={0.05}
                    thickness={0.002}
                    offset={0.003}
                    color="#F59E0B"
                  />
                </group>
              ))}
            </>
          ) : (
            <StairFlight span={span} yellow={design.nosing === 'yellow'} />
          )}
          {object.handrails && <FlightRails span={span} ramp={ramp} near={near} />}
        </group>
      ))}
    </>
  );
}

function Elevator({ object }: { object: PlanObject }) {
  const playback = useContext(TraversalMotionContext);
  const design = circulationDesign(object),
    [w, h, d] = object.dimensions,
    height = h + 2.6,
    { near, ghost } = useContext(CirculationAppearance);
  const cabin = useRef<Group>(null),
    doors = useRef<(Group | null)[]>([]),
    motion = useRef({ y: design.cabinLevel === 'upper' ? h : 0, open: design.doorsOpen ? 1 : 0 });
  const invalidate = useThree((s) => s.invalidate),
    target = design.cabinLevel === 'upper' ? h : 0;
  useEffect(() => {
    invalidate();
  }, [target, design.doorsOpen, invalidate]);
  useFrame((_, dt) => {
    const state = motion.current,
      delta = Math.min(dt, 0.05),
      travelling = Math.abs(state.y - target) > 0.001;
    const desired = travelling ? 0 : design.doorsOpen ? 1 : 0;
    state.open +=
      Math.sign(desired - state.open) * Math.min(Math.abs(desired - state.open), delta / 1.2);
    if (travelling && state.open <= 0.0001) {
      state.y += Math.sign(target - state.y) * Math.min(Math.abs(target - state.y), delta);
    }
    const override = playback?.connector?.portalId === object.portalId ? playback.connector : null;
    if (override) {
      state.y = override.cabinY;
      state.open = override.open;
    }
    const eased = state.open < 0.5 ? 4 * state.open ** 3 : 1 - (-2 * state.open + 2) ** 3 / 2;
    if (cabin.current) {
      cabin.current.position.y = state.y;
    }
    doors.current.forEach((door, i) => {
      if (door) {
        const landing = i < 2 ? 0 : h,
          open = Math.abs(state.y - landing) < 0.001 ? eased : 0;
        door.position.x = (i % 2 ? 1 : -1) * (0.3 + 0.6 * open);
      }
    });
    // Arrival changes the next frame's door target; retain a frame for that phase transition.
    if (
      !ghost &&
      !override &&
      (travelling || Math.abs(state.y - target) > 0.001 || Math.abs(state.open - desired) > 0.0001)
    ) {
      invalidate();
    }
  });
  const posts = useMemo(
    () =>
      [-1, 1].flatMap((x) =>
        [-1, 1].map((z): V3 => [x * (w / 2 - 0.05), height / 2, z * (d / 2 - 0.05)]),
      ),
    [w, d, height],
  );
  return (
    <>
      <Boxes
        rows={posts}
        size={[0.1, height, 0.1]}
        color="#1E2022"
        roughness={0.4}
        metalness={0.8}
      />
      {[0, h, height].map((y) => (
        <group key={y}>
          {y === h ? (
            <>
              {[-1, 1].map((side) => (
                <Part
                  key={side}
                  size={[0.15, 0.09, d]}
                  at={[side * (w / 2 - 0.075), y - 0.045, 0]}
                  color="#1E2022"
                />
              ))}
              <Part size={[w, 0.09, 0.15]} at={[0, y - 0.045, -d / 2 + 0.075]} color="#1E2022" />
            </>
          ) : (
            <Part size={[w, 0.09, d]} at={[0, y - 0.045, 0]} color="#1E2022" />
          )}
          {y === height && design.showLandings && (
            <Sign text="ACCESS" at={[0, y + 0.008, 0]} size={[1, 1]} flat color="#38BDF8" />
          )}
        </group>
      ))}
      {design.glass &&
        [-1, 1].map((side) => (
          <Part
            key={side}
            size={[0.012, height, d - 0.2]}
            at={[side * (w / 2 - 0.06), height / 2, 0]}
            glass
          />
        ))}
      {design.glass && (
        <Part size={[w - 0.2, height, 0.012]} at={[0, height / 2, -d / 2 + 0.06]} glass />
      )}
      {near &&
        [-1, 1].map((side) => (
          <Part
            key={side}
            size={[0.08, height, 0.08]}
            at={[side * (w / 2 - 0.2), height / 2, -d / 2 + 0.25]}
          />
        ))}
      {[0, h].map((level, i) => (
        <group key={level} position={[0, level, d / 2]}>
          {[-1, 1].map((side) => (
            <Part
              key={side}
              size={[(w - 1.2) / 2, 2.2, 0.09]}
              at={[side * (0.6 + (w - 1.2) / 4), 1.1, 0]}
              color="#1E2022"
            />
          ))}
          <Part size={[1.35, 0.12, 0.12]} at={[0, 2.16, 0]} />
          {[-1, 1].map((side, j) => (
            <group
              key={side}
              ref={(value) => {
                doors.current[i * 2 + j] = value;
              }}
              position={[side * 0.3, 0, 0]}
            >
              <Part size={[0.6, 2.1, 0.04]} at={[0, 1.05, -0.015]} roughness={0.3} />
              <Part size={[0.016, 2.1, 0.008]} at={[-side * 0.292, 1.05, 0.01]} color="#1E2022" />
            </group>
          ))}
          <Part size={[0.15, 0.3, 0.03]} at={[0.78, 1, 0.06]} roughness={0.2} metalness={0.9} />
          {[0.94, 1.06].map((y) => (
            <mesh key={y} position={[0.78, y, 0.081]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.023, 0.023, 0.01, 12]} />
              <Surface color="#06B6D4" metalness={0.3} emissive="#06B6D4" />
            </mesh>
          ))}
          {near && (
            <Boxes
              rows={Array.from({ length: 6 }, (_, n): V3 => [
                0.755 + (n % 2) * 0.018,
                0.89 - Math.floor(n / 2) * 0.015,
                0.082,
              ])}
              size={[0.006, 0.006, 0.006]}
            />
          )}
          <Sign
            text={design.cabinLevel === 'upper' ? '▲ L2' : '▼ L1'}
            at={[0, 2.34, 0.066]}
            size={[0.5, 0.2]}
          />
        </group>
      ))}
      <group ref={cabin} position={[0, motion.current.y, 0]}>
        {design.glass &&
          [-1, 1].map((side) => (
            <Part
              key={side}
              size={[0.012, 2.3, d - 0.4]}
              at={[side * (w / 2 - 0.2), 1.2, 0]}
              glass
            />
          ))}
        <Part
          size={[w - 0.35, 0.06, d - 0.35]}
          at={[0, 0.03, 0]}
          color="#334155"
          roughness={0.9}
          metalness={0}
        />
        <Part size={[w - 0.35, 0.08, d - 0.35]} at={[0, 2.4, 0]} color="#1E2022" />
        <Part
          size={[w - 0.7, 0.012, d - 0.7]}
          at={[0, 2.35, 0]}
          color="#EAF5FF"
          metalness={0}
          emissive="#EAF5FF"
        />
        <Part
          size={[w - 0.42, 2.3, 0.018]}
          at={[0, 1.2, -d / 2 + 0.2]}
          color="#C0C4C8"
          roughness={0.08}
          metalness={1}
        />
        {near && (
          <Rail
            points={[
              [-w / 2 + 0.24, 0.9, -d / 2 + 0.3],
              [w / 2 - 0.24, 0.9, -d / 2 + 0.3],
            ]}
          />
        )}
      </group>
    </>
  );
}

function Escalator({ object }: { object: PlanObject }) {
  const playback = useContext(TraversalMotionContext);
  const ridePhase = useRef<{ follower: typeof playback; offset: number } | null>(null);
  const grip = useCirculationTexture('grip');
  const m = circulationMetrics(object),
    design = circulationDesign(object),
    { near, ghost } = useContext(CirculationAppearance);
  const meshes = useRef<(InstancedMesh | null)[]>([]),
    phase = useRef(0),
    invalidate = useThree((s) => s.invalidate),
    belt = useCirculationTexture('belt');
  const slope = Math.hypot(m.run, m.rise),
    length = slope + 2,
    loop = length * 2,
    count = Math.ceil(loop / 0.4),
    treadWidth = Math.max(0.65, m.width - 0.8);
  const dummy = useMemo(() => new Object3D(), []);
  const update = (advance: number) => {
    phase.current = (((phase.current + advance) % loop) + loop) % loop;
    for (let i = 0; i < count; i++) {
      const t = ((i * loop) / count + phase.current) % loop,
        exposed = t <= length,
        s = exposed ? t : loop - t;
      const z =
        s < 1
          ? m.depth / 2 - s
          : s < 1 + slope
            ? m.depth / 2 - 1 - ((s - 1) * m.run) / slope
            : -m.depth / 2 + 1 - (s - 1 - slope);
      const y = s < 1 ? 0 : s < 1 + slope ? ((s - 1) * m.rise) / slope : m.rise;
      // Hidden return instances collapse inside the opaque housing; no exposed teleport at either comb.
      const fade = exposed ? Math.min(1, s / 0.3, (length - s) / 0.3) : 0;
      meshes.current.forEach((mesh, k) => {
        if (!mesh) {
          return;
        }
        const side = k === 2 ? -1 : 1,
          x = k >= 2 ? side * (treadWidth / 2 - 0.01) : 0;
        dummy.position.set(x, y + (k ? 0.006 : -0.095), z + (k === 1 ? 0.19 : 0));
        dummy.scale.set(1, fade, fade);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
    }
    meshes.current.forEach((mesh) => {
      if (mesh) {
        mesh.instanceMatrix.needsUpdate = true;
      }
    });
  };
  useLayoutEffect(() => {
    update(0);
  }, [m.run, m.rise, m.depth, m.width, count]);
  useEffect(() => {
    invalidate();
  }, [design.running, design.speed, design.direction, near, invalidate]);
  useFrame((_, dt) => {
    if (!design.running || design.speed === 0 || ghost || !near) {
      return;
    }
    const leg = playback?.path.legs[playback.leg];
    const riding = leg?.kind === 'escalator' && leg.connector?.portalId === object.portalId;
    const direction = design.direction === 'UP' ? 1 : -1;
    if (riding && playback && ridePhase.current?.follower !== playback) {
      ridePhase.current = { follower: playback, offset: phase.current - playback.s * direction };
    }
    const advance =
      riding && playback && ridePhase.current
        ? ridePhase.current.offset + playback.s * direction - phase.current
        : Math.min(dt, 0.05) * design.speed * direction;
    update(advance);
    belt.offset.x = (belt.offset.x - (advance * belt.repeat.x) / loop) % 1;
    if (!riding) {
      invalidate();
    }
  });
  const span: CirculationSpan = {
    x: 0,
    from: m.depth / 2 - 1,
    to: -m.depth / 2 + 1,
    y0: 0,
    y1: m.rise,
    width: m.width,
    steps: count,
  };
  const rows: V3[] = [];
  if (near) {
    for (let end = 0; end < 2; end++) {
      for (let i = 0; i < Math.floor(treadWidth / 0.035); i++) {
        rows.push([
          -treadWidth / 2 + i * 0.035,
          end ? m.rise + 0.015 : 0.015,
          end ? -m.depth / 2 + 0.68 : m.depth / 2 - 0.68,
        ]);
      }
    }
  }
  return (
    <>
      <Incline span={span} width={m.width} thickness={0.5} offset={-0.35} />
      {[0, 1].map((end) => (
        <group key={end}>
          <Part
            size={[m.width, 0.4, 1]}
            at={[0, (end ? m.rise : 0) - 0.24, (end ? -1 : 1) * (m.depth / 2 - 0.5)]}
          />
          <Part
            size={[treadWidth, 0.05, 0.6]}
            at={[0, (end ? m.rise : 0) - 0.025, (end ? -1 : 1) * (m.depth / 2 - 0.3)]}
            color="#F59E0B"
            roughness={0.4}
            metalness={0.8}
          />
          <Part
            size={[treadWidth, 0.015, 0.025]}
            at={[0, (end ? m.rise : 0) + 0.008, (end ? -1 : 1) * (m.depth / 2 - 0.64)]}
            color="#10B981"
            emissive="#10B981"
            metalness={0}
          />
          <Part
            size={[0.1, 0.8, 0.12]}
            at={[
              -m.width / 2 + 0.07,
              (end ? m.rise : 0) + 0.4,
              (end ? -1 : 1) * (m.depth / 2 - 0.3),
            ]}
            color="#1E2022"
          />
          <Sign
            text={!design.running ? 'Ⅱ' : (design.direction === 'UP') === (end === 0) ? '✓' : '✕'}
            color={
              !design.running
                ? '#F59E0B'
                : (design.direction === 'UP') === (end === 0)
                  ? '#10B981'
                  : '#F43F5E'
            }
            at={[
              -m.width / 2 + 0.07,
              (end ? m.rise : 0) + 0.68,
              (end ? -1 : 1) * (m.depth / 2 - 0.23),
            ]}
            size={[0.12, 0.12]}
            back={Boolean(end)}
          />
        </group>
      ))}
      {near && (
        <Boxes
          rows={rows}
          size={[0.016, 0.025, 0.14]}
          color="#F59E0B"
          roughness={0.4}
          metalness={0.8}
        />
      )}
      {[0, 1, 2, 3].map((kind) => (
        <instancedMesh
          key={`${kind}:${count}`}
          ref={(value) => {
            meshes.current[kind] = value;
          }}
          args={[undefined, undefined, count]}
          frustumCulled={false}
          castShadow
        >
          <boxGeometry
            args={
              kind === 0
                ? [treadWidth, 0.19, 0.4]
                : kind === 1
                  ? [treadWidth, 0.008, 0.02]
                  : [0.02, 0.008, 0.4]
            }
          />
          <Surface
            color={kind ? '#F59E0B' : '#1E2022'}
            roughness={0.5}
            metalness={0.7}
            bumpMap={kind === 0 ? grip : undefined}
          />
        </instancedMesh>
      ))}
      {[-1, 1].map((side) => {
        const x = side * (m.width / 2 - 0.18),
          points: V3[] = [
            [x, 0.9, m.depth / 2 - 0.35],
            [x, 1, m.depth / 2 - 0.55],
            [x, 1, span.from],
            [x, m.rise + 1, span.to],
            [x, m.rise + 1, -m.depth / 2 + 0.55],
            [x, m.rise + 0.9, -m.depth / 2 + 0.35],
            [x, m.rise + 0.65, -m.depth / 2 + 0.5],
            [x, m.rise + 0.65, span.to],
            [x, 0.65, span.from],
            [x, 0.65, m.depth / 2 - 0.5],
          ];
        return (
          <group key={side}>
            <Incline span={{ ...span, x }} width={0.06} thickness={0.3} offset={0.08} />
            {design.glass && (
              <Incline span={{ ...span, x }} width={0.012} thickness={0.92} offset={0.54} glass />
            )}
            {object.handrails && (
              <Rail
                points={points}
                radius={0.03}
                color="#1E2022"
                map={near ? belt : undefined}
                closed
              />
            )}
          </group>
        );
      })}
      {design.showLandings && (
        <Sign
          text={design.direction === 'UP' ? '↑ UP' : '↓ DOWN'}
          at={[0, m.rise + 0.009, -m.depth / 2 + 0.32]}
          flat
          size={[0.75, 0.3]}
          color="#10B981"
        />
      )}
    </>
  );
}

export function CirculationObject({
  object,
  ghost = false,
  colorOverride,
}: {
  object: PlanObject;
  ghost?: boolean;
  colorOverride?: string;
}) {
  const playback = useContext(TraversalMotionContext);
  const root = useRef<Group>(null);
  const near: boolean = true;
  const m = circulationMetrics(object);
  const unsafe =
    object.dimensions.some((value) => !Number.isFinite(value) || value <= 0) ||
    m.width > 8.2 ||
    m.rise > 12 ||
    m.depth > 25 ||
    Boolean(circulationError(object));
  return (
    <CirculationAppearance.Provider
      value={{ ghost, tint: colorOverride, near: playback ? true : near }}
    >
      <group ref={root}>
        {unsafe ? (
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry
              args={[
                Math.min(4, Math.max(0.1, Number.isFinite(m.width) ? m.width : 1)),
                1,
                Math.min(10, Math.max(0.1, Number.isFinite(m.depth) ? m.depth : 1)),
              ]}
            />
            <meshBasicMaterial color="#F43F5E" wireframe />
          </mesh>
        ) : circulationDesign(object).role === 'upper' ? (
          <>
            <Part size={[m.width, 0.05, m.depth]} at={[0, -0.025, 0]} color="#334155" />
            <Sign text={m.accessible ? 'ACCESS' : '↑'} at={[0, 0.008, 0]} flat size={[0.8, 0.8]} />
          </>
        ) : !near && !playback ? (
          <CirculationFar object={object} />
        ) : object.recipe === 'elevator' ? (
          <Elevator object={object} />
        ) : object.recipe === 'escalator' ? (
          <Escalator object={object} />
        ) : (
          <FixedFlights object={object} />
        )}
      </group>
    </CirculationAppearance.Provider>
  );
}
