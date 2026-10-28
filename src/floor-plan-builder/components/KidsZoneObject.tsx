import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { Line } from '@react-three/drei';
import {
  CanvasTexture,
  Color,
  Object3D,
  SRGBColorSpace,
  type Group,
  type InstancedMesh,
} from 'three';
import {
  KIDS_BALL_PIT_RADIUS,
  KIDS_GATE_WIDTH,
  KIDS_WALL_HEIGHT,
  KIDS_WALL_THICKNESS,
  kidsGateLocal,
  kidsLayout,
} from '../model/kids.ts';
import type { PlanObject } from '../model/types.ts';

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function useArchSign() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.fillStyle = '#10B981';
    context.fillRect(0, 0, 512, 192);
    context.fillStyle = '#FFFFFF';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '700 44px Arial, sans-serif';
    context.fillText('KIDS ZONE', 256, 70, 480);
    context.font = '600 30px Arial, sans-serif';
    context.fillText('SUPERVISED PLAY', 256, 130, 480);
    const value = new CanvasTexture(canvas);
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 4;
    return value;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

const BALL_PALETTE = ['#06B6D4', '#F59E0B', '#EF4444', '#FFFFFF'];

function Tiles({ w, d, ghost }: { w: number; d: number; ghost: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const count = Math.max(1, Math.round(w)) * Math.max(1, Math.round(d));
  const cells = useMemo(() => {
    const nx = Math.max(1, Math.round(w));
    const nz = Math.max(1, Math.round(d));
    const items: { at: [number, number, number]; color: string }[] = [];
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        items.push({
          at: [-w / 2 + ((ix + 0.5) * w) / nx, 0.025, -d / 2 + ((iz + 0.5) * d) / nz],
          color: (ix + iz) % 2 ? '#F59E0B' : '#06B6D4',
        });
      }
    }
    return { items, size: [w / nx - 0.02, 0.05, d / nz - 0.02] as const };
  }, [w, d]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const dummy = new Object3D();
    const tint = new Color();
    cells.items.forEach((item, index) => {
      dummy.position.set(...item.at);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, tint.set(item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
  }, [cells]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} receiveShadow>
      <boxGeometry args={[...cells.size]} />
      <meshStandardMaterial
        roughness={0.7}
        metalness={0}
        transparent={ghost}
        opacity={ghost ? 0.45 : 1}
      />
    </instancedMesh>
  );
}

function Balls({
  center,
  spread,
  ghost,
}: {
  center: [number, number];
  spread: number;
  ghost: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  const rows = useMemo(() => {
    const random = mulberry32(1234);
    return Array.from({ length: 150 }, (_, i) => {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 0.62 * spread;
      return {
        at: [
          center[0] + Math.cos(angle) * radius,
          0.12 + (i % 3) * 0.07,
          center[1] + Math.sin(angle) * radius,
        ] as [number, number, number],
        color: BALL_PALETTE[i % BALL_PALETTE.length]!,
      };
    });
  }, [center, spread]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const dummy = new Object3D();
    const tint = new Color();
    rows.forEach((row, index) => {
      dummy.position.set(...row.at);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, tint.set(row.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
  }, [rows]);
  if (ghost) {
    return null;
  }
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, rows.length)]} castShadow>
      <sphereGeometry args={[0.04, 8, 6]} />
      <meshStandardMaterial roughness={0.2} metalness={0} />
    </instancedMesh>
  );
}

function Cushions({
  w,
  d,
  density,
  ghost,
  exclude,
}: {
  w: number;
  d: number;
  density: number;
  ghost: boolean;
  exclude: { minX: number; maxX: number; minZ: number; maxZ: number }[];
}) {
  const groups = useMemo(() => {
    const random = mulberry32(777);
    const target = Math.max(3, Math.round(w * d * 0.5 * density));
    const accepted: {
      at: [number, number, number];
      yaw: number;
      color: string;
      kind: number;
    }[] = [];
    let guard = 0;
    while (accepted.length < target && guard++ < target * 8) {
      const x = (random() - 0.5) * (w - 1.6);
      const z = (random() - 0.5) * (d - 1.6);
      if (exclude.some((box) => x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ)) {
        continue;
      }
      accepted.push({
        at: [x, 0.175, z],
        yaw: random() * Math.PI,
        color: BALL_PALETTE[accepted.length % BALL_PALETTE.length]!,
        kind: accepted.length % 3,
      });
    }
    return [0, 1, 2].map((kind) => accepted.filter((row) => row.kind === kind));
  }, [w, d, density, exclude]);
  return (
    <>
      {(
        [
          { geometry: <boxGeometry args={[0.4, 0.25, 0.4]} /> },
          { geometry: <cylinderGeometry args={[0.2, 0.22, 0.25, 12]} /> },
          { geometry: <cylinderGeometry args={[0.26, 0.26, 0.4, 3]} /> },
        ] as const
      ).map((slot, kind) => (
        <CushionInstances key={kind} rows={groups[kind]!} ghost={ghost}>
          {slot.geometry}
        </CushionInstances>
      ))}
    </>
  );
}

function CushionInstances({
  rows,
  ghost,
  children,
}: {
  rows: { at: [number, number, number]; yaw: number; color: string }[];
  ghost: boolean;
  children: ReactNode;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const dummy = new Object3D();
    const tint = new Color();
    rows.forEach((row, index) => {
      dummy.position.set(...row.at);
      dummy.rotation.set(0, row.yaw, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, tint.set(row.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
  }, [rows]);
  if (!rows.length) {
    return null;
  }
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, rows.length]} castShadow receiveShadow>
      {children}
      <meshStandardMaterial
        roughness={0.6}
        metalness={0}
        transparent={ghost}
        opacity={ghost ? 0.45 : 1}
      />
    </instancedMesh>
  );
}

export function KidsZoneObject({
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
  const density = object.kidsDensity;
  const root = useRef<Group>(null);
  const near: boolean = true;

  const opacity = ghost ? 0.45 : 1;
  const hw = w / 2;
  const hd = d / 2;
  const t = KIDS_WALL_THICKNESS;
  const wallH = KIDS_WALL_HEIGHT;
  const gateHalf = KIDS_GATE_WIDTH / 2;
  const { pit, slide, ringScale } = kidsLayout(object);
  const sign = useArchSign();
  const gate = kidsGateLocal(object);
  const exclusions = useMemo(
    () => [
      {
        minX: pit[0] - ringScale - 0.3,
        maxX: pit[0] + ringScale + 0.3,
        minZ: pit[1] - ringScale - 0.3,
        maxZ: pit[1] + ringScale + 0.3,
      },
      { minX: slide[0] - 0.7, maxX: slide[0] + 0.7, minZ: slide[1] - 0.9, maxZ: slide[1] + 0.9 },
    ],
    [pit, slide, ringScale],
  );

  if (!near && !topDown) {
    return (
      <group ref={root} name="KidsZoneFar">
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.026, 0]} receiveShadow>
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial
            color="#0ea5b7"
            roughness={0.7}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
        {[
          { size: [w, wallH, t] as const, at: [0, wallH / 2, -hd + t / 2] as const },
          { size: [w, wallH, t] as const, at: [0, wallH / 2, hd - t / 2] as const },
          { size: [t, wallH, d] as const, at: [hw - t / 2, wallH / 2, 0] as const },
          { size: [t, wallH, d] as const, at: [-hw + t / 2, wallH / 2, 0] as const },
        ].map((item, index) => (
          <mesh key={index} position={[...item.at]}>
            <boxGeometry args={[...item.size]} />
            <meshStandardMaterial
              color="#10B981"
              roughness={0.6}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
        ))}
        <mesh position={[pit[0], 0.06, pit[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[KIDS_BALL_PIT_RADIUS * ringScale, 20]} />
          <meshStandardMaterial
            color="#EF4444"
            roughness={0.4}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
      </group>
    );
  }

  const wall = (
    key: string,
    size: readonly [number, number, number],
    at: readonly [number, number, number],
  ) => (
    <mesh key={key} position={[...at]} castShadow receiveShadow>
      <boxGeometry args={[...size]} />
      <meshStandardMaterial
        color="#10B981"
        roughness={0.6}
        metalness={0}
        transparent={ghost}
        opacity={opacity}
      />
    </mesh>
  );

  return (
    <group ref={root} name="KidsZone">
      <Tiles w={w} d={d} ghost={ghost} />
      {wall('back', [w, wallH, t], [0, wallH / 2, -hd + t / 2])}
      {wall(
        'front-left',
        [hw - gateHalf, wallH, t],
        [-(gateHalf + (hw - gateHalf) / 2), wallH / 2, hd - t / 2],
      )}
      {wall(
        'front-right',
        [hw - gateHalf, wallH, t],
        [gateHalf + (hw - gateHalf) / 2, wallH / 2, hd - t / 2],
      )}
      {wall('left', [t, wallH, d - 2 * t], [-hw + t / 2, wallH / 2, 0])}
      {wall('right', [t, wallH, d - 2 * t], [hw - t / 2, wallH / 2, 0])}
      {[
        [-hw + t / 2, -hd + t / 2],
        [hw - t / 2, -hd + t / 2],
        [hw - t / 2, hd - t / 2],
        [-hw + t / 2, hd - t / 2],
      ].map(([x, z], index) => (
        <mesh key={`corner-${index}`} position={[x!, wallH / 2, z!]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, wallH, 12]} />
          <meshStandardMaterial
            color="#10B981"
            roughness={0.6}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`gate-${side}`} position={[side * gateHalf, 0.175, hd - t / 2]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.35, 12]} />
          <meshStandardMaterial
            color="#10B981"
            roughness={0.6}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
      ))}
      <mesh
        position={[pit[0], 0.2 * ringScale, pit[1]]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={ringScale}
        castShadow
      >
        <torusGeometry args={[0.8, 0.2, 10, 24]} />
        <meshStandardMaterial
          color="#EF4444"
          roughness={0.5}
          transparent={ghost}
          opacity={opacity}
        />
      </mesh>
      <Balls center={[pit[0], pit[1]]} spread={ringScale} ghost={ghost} />
      <group name="ToddlerSlide" position={[slide[0], 0, slide[1]]}>
        {[0, 1].map((step) => (
          <mesh
            key={step}
            position={[-0.2 + step * 0.001, 0.2 + step * 0.25, -0.35 + step * 0.3]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.8, 0.2, 0.3]} />
            <meshStandardMaterial
              color="#2563EB"
              roughness={0.5}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
        ))}
        <mesh position={[0.1, 0.35, 0.25]} rotation={[0.5, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.8, 0.08, 1.1]} />
          <meshStandardMaterial
            color="#2563EB"
            roughness={0.5}
            transparent={ghost}
            opacity={opacity}
          />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.42, 0.5, 0]} castShadow>
            <boxGeometry args={[0.06, 0.5, 1.2]} />
            <meshStandardMaterial
              color="#1E40AF"
              roughness={0.5}
              transparent={ghost}
              opacity={opacity}
            />
          </mesh>
        ))}
      </group>
      <Cushions w={w} d={d} density={density} ghost={ghost} exclude={exclusions} />
      {!ghost && sign && (
        <group position={[0, 0, hd - t / 2]}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.55, 0.5, 0]} castShadow>
              <cylinderGeometry args={[0.04, 0.04, 1.0, 8]} />
              <meshStandardMaterial
                {...{ roughness: 0.35, metalness: 0.85 }}
                color="#C0C4C8"
                transparent={ghost}
                opacity={opacity}
              />
            </mesh>
          ))}
          <mesh position={[0, 1.0, 0]}>
            <boxGeometry args={[0.8, 0.3, 0.04]} />
            <meshStandardMaterial color="#10B981" roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.0, 0.021]}>
            <planeGeometry args={[0.76, 0.28]} />
            <meshBasicMaterial map={sign} toneMapped={false} />
          </mesh>
        </group>
      )}
      {topDown && (
        <TopDownKids
          w={w}
          d={d}
          pit={[pit[0], pit[1]]}
          ringScale={ringScale}
          slide={[slide[0], slide[1]]}
          gate={gate}
        >
          <></>
        </TopDownKids>
      )}
    </group>
  );
}

function TopDownKids({
  w,
  d,
  pit,
  ringScale,
  slide,
  gate,
  children,
}: {
  w: number;
  d: number;
  pit: [number, number];
  ringScale: number;
  slide: [number, number];
  gate: [readonly [number, number], readonly [number, number]];
  children: ReactNode;
}) {
  void children;
  const hw = w / 2;
  const hd = d / 2;
  const radius = KIDS_BALL_PIT_RADIUS * ringScale;
  const circle: [number, number, number][] = Array.from({ length: 25 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2;
    return [pit[0] + Math.cos(angle) * radius, 0.1, pit[1] + Math.sin(angle) * radius];
  });
  return (
    <>
      <Line
        points={[
          [-hw, 0.1, -hd],
          [hw, 0.1, -hd],
          [hw, 0.1, hd],
          [-hw, 0.1, hd],
          [-hw, 0.1, -hd],
        ]}
        color="#10B981"
        lineWidth={2.5}
      />
      <Line points={circle} color="#EF4444" lineWidth={2} />
      <Line
        points={[
          [slide[0] - 0.4, 0.1, slide[1] - 0.6],
          [slide[0] + 0.4, 0.1, slide[1] - 0.6],
          [slide[0] + 0.4, 0.1, slide[1] + 0.6],
          [slide[0] - 0.4, 0.1, slide[1] + 0.6],
          [slide[0] - 0.4, 0.1, slide[1] - 0.6],
        ]}
        color="#2563EB"
        lineWidth={2}
      />
      <Line
        points={[
          [gate[0][0], 0.1, gate[0][1]],
          [gate[1][0], 0.1, gate[1][1]],
        ]}
        color="#FFFFFF"
        lineWidth={2}
        dashed
      />
    </>
  );
}
