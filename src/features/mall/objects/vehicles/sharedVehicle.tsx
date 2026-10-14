import { useEffect, useMemo } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import { beveledBox } from '@/features/assets/catalog/beveled-box.ts';
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Quaternion,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';

export type VehicleKind = 'sedan' | 'electric' | 'suv' | 'pickup' | 'van' | 'estate';
export type VehicleDetail = 'high' | 'low';
export type VehiclePosition = [number, number, number];

export interface VehicleProps extends Omit<
  ThreeElements['group'],
  'position' | 'rotation' | 'scale' | 'children'
> {
  position?: VehiclePosition;
  rotation?: VehiclePosition;
  scale?: number | VehiclePosition;
  /** Body paint color; defaults to the source scene's midnight blue. */
  paint?: string;
  /** Nominal body dimensions in metres, excluding mirrors/trim. Scales preserve source proportions. */
  dimensionsMetres?: Partial<{ length: number; width: number; height: number }>;
  detail?: VehicleDetail;
}

export const DEFAULT_VEHICLE_DIMENSIONS: Record<
  VehicleKind,
  Readonly<{ length: number; width: number; height: number }>
> = {
  sedan: { length: 4.74, width: 1.87, height: 1.49 },
  electric: { length: 4.76, width: 1.89, height: 1.53 },
  suv: { length: 4.94, width: 1.99, height: 1.85 },
  pickup: { length: 5.38, width: 2, height: 1.88 },
  van: { length: 5.04, width: 1.98, height: 2.1 },
  estate: { length: 4.88, width: 1.88, height: 1.59 },
};

const SPECS: Record<
  VehicleKind,
  {
    length: number;
    width: number;
    height: number;
    belt: number;
    wheel: number;
    frontAxle: number;
    rearAxle: number;
    windshieldY: number;
    windshieldZ: number;
    rearGlassY: number;
    rearGlassZ: number;
  }
> = {
  sedan: {
    length: 4.74,
    width: 1.87,
    height: 1.49,
    belt: 1.035,
    wheel: 0.355,
    frontAxle: -1.46,
    rearAxle: 1.4,
    windshieldY: -1.1,
    windshieldZ: 0.74,
    rearGlassY: 1.55,
    rearGlassZ: 1.15,
  },
  electric: {
    length: 4.76,
    width: 1.89,
    height: 1.53,
    belt: 1.055,
    wheel: 0.37,
    frontAxle: -1.47,
    rearAxle: 1.45,
    windshieldY: -1.2,
    windshieldZ: 0.75,
    rearGlassY: 1.64,
    rearGlassZ: 1.18,
  },
  suv: {
    length: 4.94,
    width: 1.99,
    height: 1.85,
    belt: 1.16,
    wheel: 0.405,
    frontAxle: -1.52,
    rearAxle: 1.47,
    windshieldY: -1.15,
    windshieldZ: 1.37,
    rearGlassY: 2.03,
    rearGlassZ: 1.34,
  },
  pickup: {
    length: 5.38,
    width: 2,
    height: 1.88,
    belt: 1.19,
    wheel: 0.414,
    frontAxle: -1.68,
    rearAxle: 1.63,
    windshieldY: -1.48,
    windshieldZ: 0.7,
    rearGlassY: 1.04,
    rearGlassZ: 0.95,
  },
  van: {
    length: 5.04,
    width: 1.98,
    height: 2.1,
    belt: 1.15,
    wheel: 0.375,
    frontAxle: -1.48,
    rearAxle: 1.48,
    windshieldY: -1.7,
    windshieldZ: 2.17,
    rearGlassY: 2.39,
    rearGlassZ: 0,
  },
  estate: {
    length: 4.88,
    width: 1.88,
    height: 1.59,
    belt: 1.065,
    wheel: 0.372,
    frontAxle: -1.48,
    rearAxle: 1.47,
    windshieldY: -1.14,
    windshieldZ: 1.4,
    rearGlassY: 2.05,
    rearGlassZ: 1.26,
  },
};

const paintFallback = '#18365c';
const rubber = '#15191d';
const black = '#10161c';
const chrome = '#8d9a9f';
const darkMetal = '#353e45';
const glass = '#16333f';
const seat = '#242a2c';

function useOwnedGeometry<T extends BufferGeometry>(factory: () => T, deps: unknown[]): T {
  // Each mounted vehicle owns its generated mesh buffers, so ordinary R3F unmount disposal applies.
  return useMemo(factory, deps);
}

function bodyGeometry(kind: VehicleKind, detail: VehicleDetail): BufferGeometry {
  const s = SPECS[kind];
  const half = s.length / 2;
  const profile = [
    [-0.8, 0.34],
    [-0.94, 0.45],
    [-1, 0.63],
    [-1, -0.16],
    [-0.97, -0.035],
    [-0.83, 0.015],
    [-0.52, 0.038],
    [0, 0.05],
    [0.52, 0.038],
    [0.83, 0.015],
    [0.97, -0.035],
    [1, -0.16],
    [1, 0.63],
    [0.94, 0.45],
    [0.8, 0.34],
  ];
  const sections = [
    [-half, 0.87, s.belt - 0.17],
    [-half + 0.1, 0.94, s.belt - 0.1],
    [-half + 0.3, 0.986, s.belt - 0.025],
    [s.frontAxle, 1, s.belt + 0.012],
    [s.windshieldY, 1, s.belt],
    [0, 1, s.belt - 0.008],
    [s.rearAxle, 1, s.belt],
    [half - 0.32, 0.985, s.belt - 0.045],
    [half - 0.12, 0.95, s.belt - 0.09],
    [half, 0.88, s.belt - 0.14],
  ].sort((a, b) => a[0]! - b[0]!);
  const along = detail === 'high' ? 8 : 3;
  const expanded: number[][] = [];
  for (let i = 0; i < sections.length - 1; i += 1) {
    const a = sections[i]!;
    const b = sections[i + 1]!;
    for (let j = 0; j < along; j += 1) {
      const t = j / along;
      expanded.push(a.map((value, k) => value * (1 - t) + b[k]! * t));
    }
  }
  expanded.push(sections.at(-1)!);
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const [y, widthFactor, belt] of expanded) {
    for (const [profileIndex, [xFactor, zOffset]] of profile.entries()) {
      const z = profileIndex >= 3 && profileIndex <= 11 ? belt! + zOffset! : zOffset!;
      vertices.push(xFactor! * widthFactor! * (s.width / 2), y!, z);
    }
  }
  const ring = profile.length;
  for (let j = 0; j < expanded.length - 1; j += 1) {
    const midY = (expanded[j]![0]! + expanded[j + 1]![0]!) * 0.5;
    for (let i = 0; i < ring; i += 1) {
      const onWheelOpening =
        (i === 2 || i === 11) &&
        [s.frontAxle, s.rearAxle].some((axle) => Math.abs(midY - axle) < s.wheel + 0.069);
      if (onWheelOpening) {
        continue;
      }
      const a = j * ring + i;
      const b = j * ring + ((i + 1) % ring);
      const c = (j + 1) * ring + ((i + 1) % ring);
      const d = (j + 1) * ring + i;
      indices.push(a, b, d, b, c, d);
    }
  }
  // Separate cap vertices retain hard front/rear normals at the loft boundary.
  for (const end of [0, expanded.length - 1]) {
    const [y, widthFactor, belt] = expanded[end]!;
    const outline = new Shape();
    profile.forEach(([x, offset], index) => {
      const z = index >= 3 && index <= 11 ? belt! + offset! : offset!;
      if (index === 0) {
        outline.moveTo((x! * widthFactor! * s.width) / 2, z);
      } else {
        outline.lineTo((x! * widthFactor! * s.width) / 2, z);
      }
    });
    outline.closePath();
    const cap = new ShapeGeometry(outline);
    const positions = cap.getAttribute('position');
    const base = vertices.length / 3;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      vertices.push(positions.getX(vertex), y!, positions.getY(vertex));
    }
    for (let triangle = 0; triangle < cap.index!.count; triangle += 3) {
      const a = base + cap.index!.getX(triangle);
      const b = base + cap.index!.getX(triangle + 1);
      const c = base + cap.index!.getX(triangle + 2);
      indices.push(...(end === 0 ? [a, b, c] : [a, c, b]));
    }
    cap.dispose();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

function panelGeometry(
  corners: VehiclePosition[],
  bow = 0.02,
  detail: VehicleDetail = 'high',
): BufferGeometry {
  const [a, b, c, d] = corners;
  const nx = detail === 'high' ? 12 : 3;
  const ny = detail === 'high' ? 4 : 1;
  const p = (u: number, v: number): VehiclePosition => {
    const base: VehiclePosition = [
      (a![0] * (1 - u) + b![0] * u) * (1 - v) + (d![0] * (1 - u) + c![0] * u) * v,
      (a![1] * (1 - u) + b![1] * u) * (1 - v) + (d![1] * (1 - u) + c![1] * u) * v,
      (a![2] * (1 - u) + b![2] * u) * (1 - v) + (d![2] * (1 - u) + c![2] * u) * v,
    ];
    const n = new Vector3(b![0] - a![0], b![1] - a![1], b![2] - a![2])
      .cross(new Vector3(d![0] - a![0], d![1] - a![1], d![2] - a![2]))
      .normalize();
    return [
      base[0] + n.x * bow * Math.sin(Math.PI * u) * Math.sin(Math.PI * v),
      base[1] + n.y * bow * Math.sin(Math.PI * u) * Math.sin(Math.PI * v),
      base[2] + n.z * bow * Math.sin(Math.PI * u) * Math.sin(Math.PI * v),
    ];
  };
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= ny; j += 1) {
    for (let i = 0; i <= nx; i += 1) {
      vertices.push(...p(i / nx, j / ny));
    }
  }
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const k = j * (nx + 1) + i;
      indices.push(k, k + 1, k + nx + 1, k + 1, k + nx + 2, k + nx + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function makeSideSilhouette(kind: VehicleKind, detail: VehicleDetail): BufferGeometry {
  const s = SPECS[kind];
  const half = s.length / 2;
  const zc = s.wheel - 0.005;
  const r = s.wheel + 0.07;
  const shape = new Shape();
  shape.moveTo(-half, 0.47);
  shape.lineTo(-half, s.belt - 0.14);
  shape.lineTo(half, s.belt - 0.14);
  shape.lineTo(half, 0.47);
  // Trace both wheel openings rear-to-front to avoid self-intersecting faces.
  for (const axle of [s.rearAxle, s.frontAxle]) {
    shape.lineTo(axle + r, 0.47);
    shape.lineTo(axle + r, zc);
    for (let i = 0; i <= 24; i += 1) {
      const a = (Math.PI * i) / 24;
      shape.lineTo(axle + r * Math.cos(a), zc + r * Math.sin(a));
    }
    shape.lineTo(axle - r, 0.47);
  }
  shape.closePath();
  const raw = new ShapeGeometry(shape, detail === 'high' ? 12 : 4);
  const pos = raw.getAttribute('position');
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    arr[i * 3] = 0;
    arr[i * 3 + 1] = pos.getX(i);
    arr[i * 3 + 2] = pos.getY(i);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(arr, 3));
  g.setIndex(raw.getIndex());
  g.computeVertexNormals();
  raw.dispose();
  return g;
}

function BeveledBox({
  size,
  position,
  color,
  radius = 0.035,
  metalness = 0,
  roughness = 0.42,
}: {
  size: VehiclePosition;
  position: VehiclePosition;
  color: string;
  radius?: number;
  metalness?: number;
  roughness?: number;
}) {
  const attributes = useMemo(() => {
    const geometry = beveledBox(size, Math.min(radius, ...size.map((value) => value / 2)), 2);
    const data = {
      position: geometry.getAttribute('position').array as Float32Array,
      normal: geometry.getAttribute('normal').array as Float32Array,
    };
    geometry.dispose();
    return data;
  }, [size[0], size[1], size[2], radius]);
  return (
    <mesh position={position} castShadow receiveShadow>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[attributes.position, 3]} />
        <bufferAttribute attach="attributes-normal" args={[attributes.normal, 3]} />
      </bufferGeometry>
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  );
}

function Rod({
  start,
  end,
  radius,
  color,
  metalness = 0.05,
}: {
  start: VehiclePosition;
  end: VehiclePosition;
  radius: number;
  color: string;
  metalness?: number;
}) {
  const a = useMemo(() => new Vector3(...start), [start.join(',')]);
  const b = useMemo(() => new Vector3(...end), [end.join(',')]);
  const mid = useMemo(() => a.clone().add(b).multiplyScalar(0.5), [a, b]);
  const direction = useMemo(() => b.clone().sub(a), [a, b]);
  const quaternion = useMemo(
    () => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize()),
    [direction],
  );
  return (
    <mesh position={mid} quaternion={quaternion} castShadow>
      <cylinderGeometry args={[radius, radius, direction.length(), 10]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={0.32} />
    </mesh>
  );
}

function VehicleWheel({
  x,
  y,
  radius,
  lugCount,
  detail,
}: {
  x: number;
  y: number;
  radius: number;
  lugCount: number;
  detail: VehicleDetail;
}) {
  const segments = detail === 'high' ? 48 : 20;
  return (
    <group position={[x, y, radius - 0.005]} rotation={[0, 0, (-Math.sign(x) * Math.PI) / 2]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, 0.29, segments, 1, true]} />
        <meshStandardMaterial color={rubber} roughness={0.89} side={DoubleSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 0.91, 0.009, 6, segments]} />
        <meshStandardMaterial color="#272d31" roughness={0.75} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[radius * 0.75, radius * 0.75, 0.12, segments]} />
        <meshStandardMaterial color={darkMetal} metalness={0.8} roughness={0.32} />
      </mesh>
      <mesh position={[0, 0.075, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 0.72, 0.018, 8, segments]} />
        <meshStandardMaterial color={chrome} metalness={0.92} roughness={0.22} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[radius * 0.66, radius * 0.66, 0.018, segments]} />
        <meshStandardMaterial color="#171c20" metalness={0.82} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.094, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.03, 28]} />
        <meshStandardMaterial color={chrome} metalness={0.95} roughness={0.23} />
      </mesh>
      {Array.from({ length: lugCount }, (_, i) => {
        const a = (i / lugCount) * Math.PI * 2;
        const outer = radius * 0.63;
        const inner = 0.07;
        return (
          <group key={i}>
            <Rod
              start={[0, 0.09, 0]}
              end={[inner * Math.cos(a), 0.105, inner * Math.sin(a)]}
              radius={0.018}
              color={chrome}
              metalness={0.92}
            />
            <Rod
              start={[inner * Math.cos(a), 0.105, inner * Math.sin(a)]}
              end={[outer * Math.cos(a + 0.1), 0.105, outer * Math.sin(a + 0.1)]}
              radius={0.015}
              color={chrome}
              metalness={0.92}
            />
            <mesh position={[radius * 0.38 * Math.cos(a), 0.11, radius * 0.38 * Math.sin(a)]}>
              <cylinderGeometry args={[0.009, 0.009, 0.016, 8]} />
              <meshStandardMaterial color="#20272b" metalness={0.8} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0.02, 0, radius * 0.4]}>
        <boxGeometry args={[0.045, 0.06, 0.15]} />
        <meshStandardMaterial color="#852515" roughness={0.42} />
      </mesh>
    </group>
  );
}

function SideWindow({
  kind,
  side,
  detail,
  paintColor,
  corners,
}: {
  kind: VehicleKind;
  side: number;
  detail: VehicleDetail;
  paintColor: string;
  corners: VehiclePosition[];
}) {
  const sideGlass = useOwnedGeometry(
    () => panelGeometry(corners, 0.018, detail),
    [kind, side, detail],
  );
  useEffect(() => () => sideGlass.dispose(), [sideGlass]);
  const [lowerFront, upperFront, upperBack, lowerBack] = corners;
  return (
    <group>
      <mesh geometry={sideGlass}>
        <meshPhysicalMaterial
          color={glass}
          transmission={0.7}
          thickness={0.018}
          ior={1.46}
          metalness={0.14}
          roughness={0.13}
          clearcoat={0.84}
          side={DoubleSide}
        />
      </mesh>
      <Rod start={lowerFront!} end={upperFront!} radius={0.042} color={paintColor} />
      <Rod start={upperBack!} end={lowerBack!} radius={0.052} color={paintColor} />
      <Rod start={upperFront!} end={upperBack!} radius={0.028} color={paintColor} />
      <Rod
        start={[side * SPECS[kind].width * 0.445, 0.1, SPECS[kind].belt + 0.035]}
        end={[side * SPECS[kind].width * 0.39, 0.1, SPECS[kind].height - 0.085]}
        radius={0.028}
        color={black}
      />
      {(kind === 'suv' || kind === 'estate') && (
        <Rod
          start={[side * SPECS[kind].width * 0.445, 1.13, SPECS[kind].belt + 0.035]}
          end={[side * SPECS[kind].width * 0.39, 1, SPECS[kind].height - 0.085]}
          radius={0.026}
          color={black}
        />
      )}
    </group>
  );
}

function Cabin({
  kind,
  paintColor,
  detail,
}: {
  kind: VehicleKind;
  paintColor: string;
  detail: VehicleDetail;
}) {
  const s = SPECS[kind];
  const w = s.width / 2;
  const h = s.height;
  const rw = w * (kind === 'van' ? 0.86 : 0.78);
  const frontY = s.windshieldY;
  const backY = s.rearGlassY;
  const top = h - 0.035;
  const cabRearY =
    kind === 'pickup'
      ? -0.97
      : kind === 'van'
        ? 1.88
        : backY - (kind === 'suv' || kind === 'estate' ? 0.52 : 0.72);
  const bodyFront = s.frontAxle - s.wheel - 0.09;
  const fw = w * 0.89;
  const roof = useOwnedGeometry(
    () =>
      panelGeometry(
        [
          [-rw, frontY, top - 0.045],
          [rw, frontY, top - 0.045],
          [rw, cabRearY, top - 0.04],
          [-rw, cabRearY, top - 0.04],
        ],
        0.035,
        detail,
      ),
    [kind, detail],
  );
  const windshield = useOwnedGeometry(
    () =>
      panelGeometry(
        [
          [-fw, bodyFront, s.belt + 0.035],
          [fw, bodyFront, s.belt + 0.035],
          [rw, frontY, top - 0.066],
          [-rw, frontY, top - 0.066],
        ],
        -0.035,
        detail,
      ),
    [kind, detail],
  );
  const rearWindow = useOwnedGeometry(
    () =>
      panelGeometry(
        [
          [-rw, cabRearY, top - 0.07],
          [rw, cabRearY, top - 0.07],
          [fw, backY, s.belt + 0.035],
          [-fw, backY, s.belt + 0.035],
        ],
        0.018,
        detail,
      ),
    [kind, detail],
  );
  useEffect(
    () => () => {
      roof.dispose();
      windshield.dispose();
      rearWindow.dispose();
    },
    [roof, windshield, rearWindow],
  );
  return (
    <group>
      <mesh geometry={roof} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={paintColor}
          metalness={0.62}
          roughness={0.24}
          clearcoat={0.82}
          clearcoatRoughness={0.18}
          side={DoubleSide}
        />
      </mesh>
      <mesh geometry={windshield}>
        <meshPhysicalMaterial
          color={glass}
          transmission={0.7}
          thickness={0.018}
          ior={1.46}
          metalness={0.18}
          roughness={0.14}
          clearcoat={0.9}
          side={DoubleSide}
        />
      </mesh>
      {kind !== 'van' && kind !== 'pickup' && (
        <mesh geometry={rearWindow}>
          <meshPhysicalMaterial
            color={glass}
            transmission={0.7}
            thickness={0.018}
            ior={1.46}
            metalness={0.2}
            roughness={0.15}
            clearcoat={0.8}
            side={DoubleSide}
          />
        </mesh>
      )}
      {kind === 'van' ? (
        <>
          {[-1, 1].map((side) => (
            <group key={side}>
              <BeveledBox
                position={[side * (w + 0.008), 0.92, 1.48]}
                size={[0.035, 2.04, 1.0]}
                color={paintColor}
                radius={0.012}
                metalness={0.55}
                roughness={0.3}
              />
              <SideWindow
                kind={kind}
                side={side}
                detail={detail}
                paintColor={paintColor}
                corners={[
                  [side * (w + 0.024), -1.16, s.belt + 0.08],
                  [side * (w + 0.024), frontY + 0.08, top - 0.13],
                  [side * (w + 0.024), -0.12, top - 0.13],
                  [side * (w + 0.024), -0.12, s.belt + 0.08],
                ]}
              />
              <Rod
                start={[side * (w + 0.02), -0.1, 0.55]}
                end={[side * (w + 0.02), -0.1, 1.92]}
                radius={0.006}
                color={black}
              />
              <Rod
                start={[side * (w + 0.02), -0.1, 0.55]}
                end={[side * (w + 0.02), 1.95, 0.55]}
                radius={0.006}
                color={black}
              />
            </group>
          ))}
        </>
      ) : (
        [-1, 1].map((side) => {
          const lowerFront: VehiclePosition = [side * fw, bodyFront + 0.1, s.belt + 0.04];
          const upperFront: VehiclePosition = [side * rw, frontY + 0.08, top - 0.05];
          const upperBack: VehiclePosition = [side * rw, cabRearY, top - 0.05];
          const lowerBack: VehiclePosition = [
            side * fw,
            kind === 'pickup' ? -0.88 : kind === 'estate' ? 1.25 : backY - 0.08,
            s.belt + 0.04,
          ];
          return (
            <group key={side}>
              <SideWindow
                kind={kind}
                side={side}
                detail={detail}
                paintColor={paintColor}
                corners={[lowerFront, upperFront, upperBack, lowerBack]}
              />
            </group>
          );
        })
      )}
      {[-1, 1].map((side) => (
        <Rod
          key={`rail-${side}`}
          start={[side * rw, frontY + 0.08, top]}
          end={[side * rw, cabRearY, top]}
          radius={0.018}
          color={paintColor}
        />
      ))}
      {kind === 'pickup' && <PickupBed paintColor={paintColor} />}
    </group>
  );
}

function PickupBed({ paintColor }: { paintColor: string }) {
  return (
    <group>
      <BeveledBox
        position={[0, 1.55, 1.17]}
        size={[1.56, 1.32, 0.08]}
        color="#202930"
        radius={0.018}
      />
      {[-0.78, 0.78].map((x) => (
        <group key={x}>
          <BeveledBox
            position={[x, 1.58, 1.5]}
            size={[0.09, 1.42, 0.62]}
            color={paintColor}
            radius={0.035}
          />
          <BeveledBox
            position={[x * 0.94, 1.58, 1.79]}
            size={[0.12, 1.45, 0.08]}
            color="#91a5af"
            radius={0.018}
            metalness={0.76}
          />
        </group>
      ))}
      <BeveledBox
        position={[0, 2.22, 1.5]}
        size={[1.58, 0.09, 0.62]}
        color={paintColor}
        radius={0.035}
      />
    </group>
  );
}

function VehicleInterior({ kind, s }: { kind: VehicleKind; s: (typeof SPECS)[VehicleKind] }) {
  const frontY = s.windshieldY;
  return (
    <group>
      {[-0.43, 0.43].map((x) => (
        <group key={x}>
          <BeveledBox
            position={[x, frontY + 0.82, 0.86]}
            size={[0.48, 0.5, 0.13]}
            color={seat}
            radius={0.07}
          />
          <BeveledBox
            position={[x, frontY + 1.03, 1.13]}
            size={[0.49, 0.17, 0.55]}
            color={seat}
            radius={0.07}
          />
          <BeveledBox
            position={[x, frontY + 1.06, Math.min(s.height - 0.23, 1.52)]}
            size={[0.24, 0.13, 0.17]}
            color="#30383a"
            radius={0.05}
          />
        </group>
      ))}
      <BeveledBox
        position={[0, frontY + 0.2, s.belt - 0.02]}
        size={[1.48, 0.28, 0.16]}
        color="#202729"
        radius={0.03}
      />
      <mesh position={[-0.43, frontY + 0.46, s.belt + 0.14]} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[0.15, 0.014, 8, 32]} />
        <meshStandardMaterial color={black} roughness={0.48} />
      </mesh>
      {kind === 'pickup' && (
        <BeveledBox
          position={[0, 0.95, 0.94]}
          size={[0.42, 0.46, 0.12]}
          color={seat}
          radius={0.06}
        />
      )}
    </group>
  );
}

function BodyDetails({
  kind,
  paintColor,
  s,
}: {
  kind: VehicleKind;
  paintColor: string;
  s: (typeof SPECS)[VehicleKind];
}) {
  const { width, length, belt } = s;
  const w = width / 2;
  const half = length / 2;
  const yFront = -half - 0.04;
  const yRear = half + 0.025;
  const isUtility = kind === 'suv' || kind === 'pickup' || kind === 'van' || kind === 'estate';
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <BeveledBox
            position={[side * w, 0, 0.4]}
            size={[0.075, 2.12, 0.14]}
            color={black}
            radius={0.025}
          />
          {(kind === 'suv' || kind === 'pickup') && (
            <BeveledBox
              position={[side * (w + 0.065), 0, 0.31]}
              size={[0.15, 2.12, 0.055]}
              color={darkMetal}
              radius={0.022}
              metalness={0.76}
            />
          )}
          {(kind === 'suv' || kind === 'estate') &&
            [-1, 1].map((x) => (
              <mesh key={x} position={[side * (w + 0.017), x < 0 ? -0.18 : 0.86, belt - 0.13]}>
                <boxGeometry args={[0.025, 0.25, 0.067]} />
                <meshStandardMaterial color={black} />
              </mesh>
            ))}
          <Rod
            start={[side * (w * 0.98), -half + 0.28, belt - 0.035]}
            end={[side * (w + 0.004), s.frontAxle, belt + 0.045]}
            radius={0.0035}
            color={black}
          />
          <Rod
            start={[side * w, s.frontAxle + 0.18, belt - 0.1]}
            end={[side * w, s.rearAxle + 0.28, belt - 0.1]}
            radius={0.0035}
            color={paintColor}
          />
          {[-0.18, 0.86].map((y) => (
            <group key={y}>
              <mesh position={[side * (w + 0.009), y, belt - 0.13]}>
                <boxGeometry args={[0.022, 0.23, 0.067]} />
                <meshStandardMaterial color="#12181c" />
              </mesh>
              <mesh position={[side * (w + 0.025), y, belt - 0.12]}>
                <boxGeometry args={[0.024, 0.18, 0.022]} />
                <meshStandardMaterial color={chrome} metalness={0.84} roughness={0.28} />
              </mesh>
            </group>
          ))}
          <Rod
            start={[side * 0.91 * w, -half + 0.24, belt - 0.035]}
            end={[side * 0.91 * w, -s.length * 0.34, belt - 0.035]}
            radius={0.0025}
            color={black}
          />
          <Rod
            start={[side * (w + 0.01), -s.length * 0.34, belt - 0.035]}
            end={[side * (w + 0.01), -s.length * 0.34, 0.69]}
            radius={0.0025}
            color={black}
          />
          {[-1, 1].map((ySign) => (
            <group key={ySign}>
              <mesh
                position={[side * (w + 0.005), ySign < 0 ? s.frontAxle : s.rearAxle, 0.42]}
                rotation={[0, Math.PI / 2, Math.PI / 2]}
              >
                <torusGeometry args={[s.wheel + 0.07, isUtility ? 0.025 : 0.012, 8, 48, Math.PI]} />
                <meshStandardMaterial
                  color={isUtility ? black : paintColor}
                  metalness={0.12}
                  roughness={0.38}
                />
              </mesh>
            </group>
          ))}
          <Rod
            start={[side * (w * 0.82), s.frontAxle - 0.24, belt - 0.14]}
            end={[side * (w * 0.82), -half + 0.12, belt - 0.14]}
            radius={0.0025}
            color={black}
          />
        </group>
      ))}
      <BeveledBox
        position={[0, yFront + 0.05, 0.45]}
        size={[width * 0.82, 0.11, 0.19]}
        color="#171d21"
        radius={0.045}
      />
      {kind === 'electric' ? (
        <BeveledBox
          position={[0, yFront, 0.79]}
          size={[width * 0.4, 0.05, 0.27]}
          color={paintColor}
          radius={0.07}
        />
      ) : (
        <>
          <BeveledBox
            position={[0, yFront, 0.78]}
            size={[width * 0.42, 0.07, 0.29]}
            color="#101619"
            radius={0.045}
          />
          {[0, 1, 2, 3].map((i) => (
            <BeveledBox
              key={i}
              position={[0, yFront - 0.041, 0.67 + i * 0.065]}
              size={[width * 0.37, 0.014, 0.012]}
              color={chrome}
              radius={0.005}
              metalness={0.88}
            />
          ))}
        </>
      )}
      {[-1, 1].map((side) => (
        <group key={side}>
          <BeveledBox
            position={[side * width * 0.315, yFront - 0.015, belt - 0.16]}
            size={[0.55, 0.045, 0.17]}
            color="#10161b"
            radius={0.04}
          />
          <BeveledBox
            position={[side * width * 0.315, yFront - 0.043, belt - 0.16]}
            size={[0.51, 0.018, 0.13]}
            color="#bdd4df"
            radius={0.034}
          />
          {[-0.12, 0.08].map((x) => (
            <mesh
              key={x}
              position={[side * width * 0.315 + x, yFront - 0.058, belt - 0.16]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.03, 0.03, 0.008, 20]} />
              <meshStandardMaterial
                color="#e3edf2"
                metalness={0.4}
                roughness={0.2}
                emissive="#a6d5ee"
                emissiveIntensity={0.25}
              />
            </mesh>
          ))}
          <Rod
            start={[side * width * 0.315 - 0.2, yFront - 0.061, belt - 0.11]}
            end={[side * width * 0.315 + 0.2, yFront - 0.061, belt - 0.11]}
            radius={0.008}
            color="#d9eaf3"
          />
          <BeveledBox
            position={[side * width * 0.34, yFront - 0.023, 0.53]}
            size={[0.2, 0.04, 0.07]}
            color="#10171b"
            radius={0.019}
          />
          <BeveledBox
            position={[side * width * 0.34, yFront - 0.046, 0.53]}
            size={[0.11, 0.015, 0.025]}
            color="#adc7d4"
            radius={0.009}
          />
          <BeveledBox
            position={[side * width * 0.34, yRear, belt - 0.15]}
            size={[
              kind === 'pickup' || kind === 'van' ? 0.14 : 0.52,
              0.075,
              kind === 'pickup' || kind === 'van' ? 0.35 : 0.1,
            ]}
            color="#a5151e"
            radius={0.025}
          />
          <BeveledBox
            position={[side * width * 0.34, yRear + 0.032, belt - 0.24]}
            size={[0.095, 0.014, 0.035]}
            color="#d7e0e2"
            radius={0.009}
          />
          <BeveledBox
            position={[side * width * 0.36, yRear, 0.48]}
            size={[0.15, 0.022, 0.032]}
            color="#8f1119"
            radius={0.01}
          />
          <Rod
            start={[side * (width * 0.445), s.windshieldY + 0.3, belt + 0.11]}
            end={[side * (w + 0.17), s.windshieldY + 0.3, belt + 0.23]}
            radius={0.022}
            color={black}
          />
          <BeveledBox
            position={[side * (w + 0.19), s.windshieldY + 0.3, belt + 0.23]}
            size={[0.21, 0.25, 0.13]}
            color={paintColor}
            radius={0.055}
          />
          <BeveledBox
            position={[side * (w + 0.19), s.windshieldY + 0.43, belt + 0.23]}
            size={[0.18, 0.008, 0.09]}
            color={chrome}
            radius={0.02}
            metalness={0.75}
          />
          <BeveledBox
            position={[side * (w + 0.19), s.windshieldY + 0.15, belt + 0.21]}
            size={[0.18, 0.008, 0.016]}
            color="#d6e2e8"
            radius={0.006}
          />
          {kind !== 'van' && (
            <>
              <mesh position={[side * (w + 0.008), s.rearAxle + 0.18, belt - 0.12]}>
                <boxGeometry args={[0.013, 0.2, 0.17]} />
                <meshStandardMaterial color={black} side={DoubleSide} />
              </mesh>
            </>
          )}
        </group>
      ))}
      <BeveledBox
        position={[0, yRear, 0.42]}
        size={[width * 0.87, 0.14, 0.16]}
        color="#14191e"
        radius={0.04}
      />
      <BeveledBox
        position={[0, yFront + 0.04, 0.31]}
        size={[width * 0.78, 0.12, 0.09]}
        color={darkMetal}
        radius={0.035}
      />
    </group>
  );
}

function VehicleAssembly({
  kind,
  paint = paintFallback,
  detail = 'high',
  dimensionsMetres,
  ...groupProps
}: VehicleProps & { kind: VehicleKind }) {
  const original = SPECS[kind];
  const target = {
    length: dimensionsMetres?.length ?? original.length,
    width: dimensionsMetres?.width ?? original.width,
    height: dimensionsMetres?.height ?? original.height,
  };
  for (const [axis, value] of Object.entries(target)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`Vehicle ${axis} must be a finite positive number; received ${value}.`);
    }
  }
  const dimensionScale: VehiclePosition = [
    target.width / original.width,
    target.length / original.length,
    target.height / original.height,
  ];
  const body = useOwnedGeometry(() => bodyGeometry(kind, detail), [kind, detail]);
  const sill = useOwnedGeometry(() => makeSideSilhouette(kind, detail), [kind, detail]);
  useEffect(
    () => () => {
      body.dispose();
      sill.dispose();
    },
    [body, sill],
  );
  const s = original;
  const w = s.width / 2;
  return (
    <group {...groupProps}>
      <group rotation={[-Math.PI / 2, 0, 0]} scale={dimensionScale}>
        <mesh geometry={body} castShadow receiveShadow>
          <meshPhysicalMaterial
            color={paint}
            metalness={0.62}
            roughness={0.24}
            clearcoat={0.84}
            clearcoatRoughness={0.17}
          />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} geometry={sill} position={[side * (w + 0.012), 0, 0]} castShadow>
            <meshPhysicalMaterial
              color={paint}
              metalness={0.56}
              roughness={0.3}
              side={DoubleSide}
              clearcoat={0.72}
            />
          </mesh>
        ))}
        <VehicleInterior kind={kind} s={s} />
        <Cabin kind={kind} paintColor={paint} detail={detail} />
        <BodyDetails kind={kind} paintColor={paint} s={s} />
        {[-1, 1].flatMap((side) =>
          [s.frontAxle, s.rearAxle].map((y) => (
            <VehicleWheel
              key={`${side}:${y}`}
              x={side * (w - 0.06)}
              y={y}
              radius={s.wheel}
              lugCount={kind === 'pickup' || kind === 'van' ? 6 : 5}
              detail={detail}
            />
          )),
        )}
        {kind !== 'van' && (
          <>
            {[-0.6, 0.25].map((x) => (
              <Rod
                key={x}
                start={[x, s.frontAxle - s.wheel + 0.08, s.belt + 0.13]}
                end={[x + 0.36, s.frontAxle - s.wheel + 0.3, s.belt + 0.26]}
                radius={0.008}
                color={black}
              />
            ))}
          </>
        )}
        <BeveledBox
          position={[0, 0, 0.32]}
          size={[s.width * 0.6, s.length * 0.69, 0.1]}
          color="#1d2428"
          radius={0.02}
        />
      </group>
    </group>
  );
}

export function Sedan(props: VehicleProps) {
  return <VehicleAssembly kind="sedan" {...props} />;
}
export function ElectricCar(props: VehicleProps) {
  return <VehicleAssembly kind="electric" {...props} />;
}
export function SUV(props: VehicleProps) {
  return <VehicleAssembly kind="suv" {...props} />;
}
export function PickupTruck(props: VehicleProps) {
  return <VehicleAssembly kind="pickup" {...props} />;
}
export function UtilityVan(props: VehicleProps) {
  return <VehicleAssembly kind="van" {...props} />;
}
export function EstateCar(props: VehicleProps) {
  return <VehicleAssembly kind="estate" {...props} />;
}
