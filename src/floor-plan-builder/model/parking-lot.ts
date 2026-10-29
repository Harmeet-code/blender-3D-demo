import { pointInPolygon, polygonBounds, signedArea } from '@/utils/geometry/polygon.ts';
import { DEFAULT_PARKING, type ParkingDesign } from './parking-schema.ts';
import type { PlanObject } from './types.ts';

/**
 * Procedural layout engine for `parking-lot` (item spec §3–§5).
 *
 * Takes the authored boundary polygon plus the parking design and emits a
 * concrete spatial manifest: stall bays, drive aisles, landscaped islands and
 * light-pole positions. Bay dimensions never stretch with the footprint —
 * resizing the polygon only changes how many rows and stalls fit.
 */

export type Point2 = [number, number];
export type ParkingBayType = 'standard' | 'accessible' | 'ev' | 'motorcycle' | 'vip' | 'loading';

export interface ParkingBay {
  id: string;
  polygon: Point2[];
  center: Point2;
  /** Yaw of the parked vehicle: the bay's depth direction pointing into the drive aisle. */
  yaw: number;
  type: ParkingBayType;
  isOccupied: boolean;
  row: number;
  /** Fractional position in the authored footprint bounds, used for durable overrides. */
  u: number;
  v: number;
  pinned: boolean;
  vehicle: ParkingVehicle | null;
  hatchFor?: string;
  hatchPolygon?: Point2[];
  typeWarning?: string;
}

export interface ParkingVehicle {
  id: string;
  bayId: string;
  model: 'compact' | 'sedan' | 'suv' | 'pickup';
  length: number;
  width: number;
}

export interface ParkingAisle {
  centerline: Point2[];
  width: number;
  isOneWay: boolean;
}

export interface LotLayout {
  capacity: number;
  bays: ParkingBay[];
  aisles: ParkingAisle[];
  islands: Point2[][];
  poles: Point2[];
  inset: Point2[];
  origin: Point2;
  groundY: 0;
  asphaltY: 0.15;
  validationIssues: string[];
  gates: ParkingGate[];
  walkways: ParkingWalkway[];
  vehicleGraph: VehicleGraph;
  navDescriptors: ParkingNavDescriptor[];
}

export interface ParkingGate {
  id: string;
  edgeIndex: number;
  width: number;
  vehicleCenterline: Point2[];
  pedestrianCenterline: Point2[];
  isConnected?: boolean;
}
export interface ParkingWalkway {
  centerline: Point2[];
  width: number;
}
export interface VehicleGraph {
  nodes: Point2[];
  edges: Array<[number, number]>;
}
export interface ParkingNavDescriptor {
  polygon: Point2[];
  kind: 'drive-aisle' | 'walkway' | 'gate';
  width: number;
}

export interface BayRule {
  stallWidth: number;
  stallDepth: number;
  aisleOneWay: number;
  aisleTwoWay: number;
}

/** Item spec §3 stall & aisle geometry rules. */
export const BAY_RULES: Record<ParkingDesign['bayAngle'], BayRule> = {
  '90': { stallWidth: 2.6, stallDepth: 5.2, aisleOneWay: 6.0, aisleTwoWay: 7.0 },
  '60': { stallWidth: 2.7, stallDepth: 5.5, aisleOneWay: 4.8, aisleTwoWay: 6.5 },
  '45': { stallWidth: 2.8, stallDepth: 5.3, aisleOneWay: 3.8, aisleTwoWay: 6.0 },
  parallel: { stallWidth: 2.4, stallDepth: 6.2, aisleOneWay: 3.6, aisleTwoWay: 5.5 },
};

const VEHICLE_CAP = 400;
const MEDIAN_EVERY = 12;
const MEDIAN_WIDTH = 2.6;
const POLE_SPACING = 12;

export const parkingDesign = (object: Pick<PlanObject, 'parkingDesign'>): ParkingDesign =>
  object.parkingDesign ?? DEFAULT_PARKING;

/** Deterministic PRNG so occupancy and any jitter survive re-layout identically. */
function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeWinding(polygon: Point2[]): Point2[] {
  return signedArea(polygon) < 0 ? [...polygon].reverse() : polygon;
}

/**
 * Parallel-line inset: offset every edge inward along its normal and recombine
 * consecutive offset lines at the angle bisector. Falls back to the inset
 * bounding rectangle when the result degenerates (sharp concave notches).
 */
export function insetPolygon(polygon: Point2[], margin: number): Point2[] {
  const ccw = normalizeWinding(polygon);
  const count = ccw.length;
  const lines = ccw.map((point, index) => {
    const next = ccw[(index + 1) % count]!;
    const dx = next[0] - point[0];
    const dz = next[1] - point[1];
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    return {
      point: [point[0] + nx * margin, point[1] + nz * margin] as Point2,
      dx: dx / length,
      dz: dz / length,
    };
  });
  const inset: Point2[] = [];
  for (let i = 0; i < count; i++) {
    const a = lines[(i - 1 + count) % count]!;
    const b = lines[i]!;
    const determinant = a.dx * b.dz - a.dz * b.dx;
    if (Math.abs(determinant) < 1e-6) {
      inset.push(b.point);
      continue;
    }
    const px = b.point[0] - a.point[0];
    const pz = b.point[1] - a.point[1];
    const t = (px * b.dz - pz * b.dx) / determinant;
    inset.push([a.point[0] + a.dx * t, a.point[1] + a.dz * t]);
  }
  const valid =
    inset.length >= 3 &&
    Math.abs(signedArea(inset)) > 0.5 &&
    inset.every((point) => pointInPolygon(point, ccw));
  if (!valid) {
    return [];
  }
  return inset;
}

function segmentsCross(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const orient = (p: Point2, q: Point2, r: Point2) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < -1e-9 && o3 * o4 < -1e-9;
}

function isSimplePolygon(polygon: Point2[]): boolean {
  if (polygon.length < 3 || Math.abs(signedArea(polygon)) < 1e-6) {
    return false;
  }
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) {
      return false;
    }
    for (let j = i + 1; j < polygon.length; j++) {
      if (j === i || j === (i + 1) % polygon.length || i === (j + 1) % polygon.length) {
        continue;
      }
      if (segmentsCross(a, b, polygon[j]!, polygon[(j + 1) % polygon.length]!)) {
        return false;
      }
    }
  }
  return true;
}

function clipAisle(aisle: ParkingAisle, polygon: Point2[]): ParkingAisle[] {
  const [start, end] = aisle.centerline;
  if (!start || !end) {
    return [];
  }
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length2 = dx * dx + dz * dz;
  if (length2 < 1e-8) {
    return [];
  }
  const cuts = [0, 1];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-8) {
      continue;
    }
    const ax = a[0] - start[0];
    const az = a[1] - start[1];
    const t = (ax * ez - az * ex) / den;
    const u = (ax * dz - az * dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) {
      cuts.push(t);
    }
  }
  cuts.sort((a, b) => a - b);
  const unit: Point2 = [dx / Math.sqrt(length2), dz / Math.sqrt(length2)];
  const normal: Point2 = [-unit[1], unit[0]];
  const result: ParkingAisle[] = [];
  for (let index = 0; index + 1 < cuts.length; index++) {
    const t0 = cuts[index]!;
    const t1 = cuts[index + 1]!;
    const edge = aisle.width / 2;
    const left0: Point2 = [
      start[0] + dx * t0 + normal[0] * edge,
      start[1] + dz * t0 + normal[1] * edge,
    ];
    const right0: Point2 = [
      start[0] + dx * t0 - normal[0] * edge,
      start[1] + dz * t0 - normal[1] * edge,
    ];
    const left1: Point2 = [
      start[0] + dx * t1 + normal[0] * edge,
      start[1] + dz * t1 + normal[1] * edge,
    ];
    const right1: Point2 = [
      start[0] + dx * t1 - normal[0] * edge,
      start[1] + dz * t1 - normal[1] * edge,
    ];
    const safe = bayFits([left0, left1, right1, right0], polygon);
    if (!safe || (t1 - t0) * Math.sqrt(length2) < aisle.width) {
      continue;
    }
    result.push({
      ...aisle,
      centerline: [
        [start[0] + dx * t0, start[1] + dz * t0],
        [start[0] + dx * t1, start[1] + dz * t1],
      ],
    });
  }
  return result;
}

function corridorFits(start: Point2, end: Point2, width: number, polygon: Point2[]): boolean {
  const corridor = corridorPolygon(start, end, width);
  return corridor.length === 4 && bayFits(corridor, polygon);
}

function corridorPolygon(start: Point2, end: Point2, width: number): Point2[] {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz);
  if (length < 1e-5) {
    return [];
  }
  const nx = ((-dz / length) * width) / 2;
  const nz = ((dx / length) * width) / 2;
  return [
    [start[0] + nx, start[1] + nz],
    [end[0] + nx, end[1] + nz],
    [end[0] - nx, end[1] - nz],
    [start[0] - nx, start[1] - nz],
  ];
}

/** Stall strip depth perpendicular to the aisle (angled stalls contribute their width projection). */
function rowDepth(rule: BayRule, angle: number): number {
  return angle === 0
    ? rule.stallWidth
    : rule.stallDepth * Math.sin(angle) + rule.stallWidth * Math.cos(angle);
}

/** Along-aisle distance between consecutive stripe lines. */
function rowPitch(rule: BayRule, angle: number): number {
  return angle === 0 ? rule.stallDepth : rule.stallWidth / Math.sin(angle);
}

function bayQuad(
  origin: Point2,
  bAxis: Point2,
  nAxis: Point2,
  rule: BayRule,
  angle: number,
  towardAisle: 1 | -1,
): { polygon: Point2[]; depthDirection: Point2 } {
  if (angle === 0) {
    // Parallel parking: the stall lies along the aisle, 6.2 m long by 2.4 m deep.
    const width = [bAxis[0] * rule.stallDepth, bAxis[1] * rule.stallDepth] as Point2;
    const depth = [
      nAxis[0] * towardAisle * rule.stallWidth,
      nAxis[1] * towardAisle * rule.stallWidth,
    ] as Point2;
    return {
      polygon: [
        origin,
        [origin[0] + width[0], origin[1] + width[1]],
        [origin[0] + width[0] + depth[0], origin[1] + width[1] + depth[1]],
        [origin[0] + depth[0], origin[1] + depth[1]],
      ],
      depthDirection: [nAxis[0] * towardAisle, nAxis[1] * towardAisle],
    };
  }
  const phi = Math.PI / 2 - angle;
  const widthDirection: Point2 = [
    bAxis[0] * Math.cos(phi) - nAxis[0] * towardAisle * Math.sin(phi),
    bAxis[1] * Math.cos(phi) - nAxis[1] * towardAisle * Math.sin(phi),
  ];
  const depthDirection: Point2 = [
    bAxis[0] * Math.sin(phi) * towardAisle + nAxis[0] * Math.cos(phi) * towardAisle,
    bAxis[1] * Math.sin(phi) * towardAisle + nAxis[1] * Math.cos(phi) * towardAisle,
  ];
  const width = [
    widthDirection[0] * rule.stallWidth,
    widthDirection[1] * rule.stallWidth,
  ] as Point2;
  const depth = [
    depthDirection[0] * rule.stallDepth,
    depthDirection[1] * rule.stallDepth,
  ] as Point2;
  return {
    polygon: [
      origin,
      [origin[0] + width[0], origin[1] + width[1]],
      [origin[0] + width[0] + depth[0], origin[1] + width[1] + depth[1]],
      [origin[0] + depth[0], origin[1] + depth[1]],
    ],
    depthDirection: [depthDirection[0], depthDirection[1]],
  };
}

/** A stall is emitted only when its entire polygon lies inside the inset footprint. */
function bayFits(quad: Point2[], inset: Point2[]): boolean {
  const center: Point2 = [
    quad.reduce((sum, point) => sum + point[0], 0) / 4,
    quad.reduce((sum, point) => sum + point[1], 0) / 4,
  ];
  const samples: Point2[] = [center];
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % 4]!;
    samples.push(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point2);
  }
  if (!samples.every((point) => pointInPolygon(point, inset))) {
    return false;
  }
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % quad.length]!;
    for (let j = 0; j < inset.length; j++) {
      if (segmentsCross(a, b, inset[j]!, inset[(j + 1) % inset.length]!)) {
        return false;
      }
    }
  }
  // A concave notch can sit wholly inside a large candidate without crossing its edges.
  // Any strictly interior footprint vertex proves that candidate covers excluded terrain.
  for (const point of inset) {
    if (!pointInPolygon(point, quad)) {
      continue;
    }
    const onBoundary = quad.some((a, index) => {
      const b = quad[(index + 1) % quad.length]!;
      const length2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
      const t =
        length2 === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / length2,
              ),
            );
      return (
        Math.hypot(point[0] - (a[0] + t * (b[0] - a[0])), point[1] - (a[1] + t * (b[1] - a[1]))) <
        1e-6
      );
    });
    if (!onBoundary) {
      return false;
    }
  }
  return true;
}

function assignTypes(bays: ParkingBay[]): ParkingBay[] {
  const capacity = bays.length;
  if (capacity === 0) {
    return bays;
  }
  const accessible = Math.ceil(capacity / 25);
  const ev = capacity >= 10 ? Math.max(1, Math.round(capacity * 0.075)) : 0;
  const motorcycle = capacity >= 20 ? Math.max(1, Math.round(capacity * 0.03)) : 0;
  const assigned = bays.map((bay) => ({ ...bay, type: 'standard' as ParkingBayType }));
  // Accessible bays sit at the head of the outermost rows, closest to the walkways.
  for (let i = 0; i < accessible; i++) {
    const target = i % 2 === 0 ? Math.floor(i / 2) : assigned.length - 1 - Math.floor(i / 2);
    const bay = assigned[target];
    if (!bay || bay.type !== 'standard') {
      continue;
    }
    const neighbor = assigned
      .map((candidate, index) => ({
        candidate,
        index,
        distance: Math.hypot(
          candidate.center[0] - bay.center[0],
          candidate.center[1] - bay.center[1],
        ),
      }))
      .filter(
        ({ candidate, index }) =>
          index !== target &&
          candidate.row === bay.row &&
          candidate.type === 'standard' &&
          !candidate.hatchFor,
      )
      .sort((a, b) => a.distance - b.distance)[0]?.candidate;
    if (!neighbor) {
      continue;
    }
    bay.type = 'accessible';
    neighbor.hatchFor = bay.id;
    const fraction =
      1.2 /
      Math.max(
        1e-6,
        Math.hypot(
          neighbor.polygon[1]![0] - neighbor.polygon[0]![0],
          neighbor.polygon[1]![1] - neighbor.polygon[0]![1],
        ),
      );
    const along: Point2 = [
      neighbor.polygon[1]![0] - neighbor.polygon[0]![0],
      neighbor.polygon[1]![1] - neighbor.polygon[0]![1],
    ];
    const towardAccessible =
      (bay.center[0] - neighbor.center[0]) * along[0] +
        (bay.center[1] - neighbor.center[1]) * along[1] >
      0;
    const from = towardAccessible ? 1 - fraction : 0;
    const to = towardAccessible ? 1 : fraction;
    const interpolate = (start: Point2, end: Point2, t: number): Point2 => [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
    ];
    neighbor.hatchPolygon = [
      interpolate(neighbor.polygon[0]!, neighbor.polygon[1]!, from),
      interpolate(neighbor.polygon[0]!, neighbor.polygon[1]!, to),
      interpolate(neighbor.polygon[3]!, neighbor.polygon[2]!, to),
      interpolate(neighbor.polygon[3]!, neighbor.polygon[2]!, from),
    ];
  }
  // EV chargers and motorcycle slots spread deterministically across the remaining bays.
  let placed = 0;
  for (
    let index = 1;
    index < assigned.length && placed < ev;
    index += Math.max(2, Math.floor(assigned.length / (ev + 1)))
  ) {
    if (assigned[index]!.type === 'standard' && !assigned[index]!.hatchFor) {
      assigned[index]!.type = 'ev';
      placed += 1;
    }
  }
  placed = 0;
  for (
    let index = Math.floor(assigned.length / 2);
    index < assigned.length && placed < motorcycle;
    index += Math.max(3, Math.floor(assigned.length / (motorcycle + 1)))
  ) {
    if (assigned[index]!.type === 'standard' && !assigned[index]!.hatchFor) {
      assigned[index]!.type = 'motorcycle';
      placed += 1;
    }
  }
  return assigned;
}

function applyOverrides(bays: ParkingBay[], design: ParkingDesign): ParkingBay[] {
  const entries = Object.entries(design.overrides);
  if (entries.length === 0) {
    return bays;
  }
  const available = new Set(bays.map((_, index) => index));
  const assignments = new Map<number, { type: ParkingBayType; pinned: boolean }>();
  const decoded = entries
    .map(([key, override]) => {
      const [u, v] = key.split(',');
      return {
        u: Number(u ?? 0),
        v: Number(v ?? 0),
        type: typeof override === 'string' ? override : override.type,
        pinned: typeof override === 'string' ? true : override.pinned,
      };
    })
    .sort((a, b) => a.u - b.u || a.v - b.v);
  for (const override of decoded) {
    const nearest = [...available]
      .map((index) => ({
        index,
        distance: Math.hypot(bays[index]!.u - override.u, bays[index]!.v - override.v),
      }))
      .sort(
        (a, b) => a.distance - b.distance || bays[a.index]!.id.localeCompare(bays[b.index]!.id),
      )[0];
    if (!nearest || nearest.distance > 0.08) {
      continue;
    }
    available.delete(nearest.index);
    assignments.set(nearest.index, override);
  }
  return bays.map((bay, index) => {
    const override = assignments.get(index);
    if (!override) {
      return bay;
    }
    const { type, pinned } = override;
    const rule = BAY_RULES[design.bayAngle];
    const hasHatch = bays.some((candidate) => candidate.hatchFor === bay.id);
    const usableWidth = rule.stallWidth + (hasHatch ? 1.2 : 0);
    const requiredWidth =
      type === 'vip'
        ? 2.8
        : type === 'loading'
          ? 3.2
          : type === 'accessible'
            ? 3.8
            : type === 'motorcycle'
              ? 1.3
              : usableWidth;
    if (requiredWidth > usableWidth + 1e-6) {
      return {
        ...bay,
        typeWarning: `${type} needs ${requiredWidth.toFixed(1)} m of bay width; this layout provides ${usableWidth.toFixed(1)} m.`,
      };
    }
    return { ...bay, type, pinned };
  });
}

/** Generate the full layout manifest for a lot polygon and design. */
export function computeParkingLayout(polygon: Point2[], source: ParkingDesign): LotLayout {
  const design = source ?? DEFAULT_PARKING;
  if (!isSimplePolygon(polygon)) {
    return {
      capacity: 0,
      bays: [],
      aisles: [],
      islands: [],
      poles: [],
      inset: [],
      origin: [0, 0],
      groundY: 0,
      asphaltY: 0.15,
      validationIssues: ['Boundary must be a simple polygon with non-zero area.'],
      gates: [],
      walkways: [],
      vehicleGraph: { nodes: [], edges: [] },
      navDescriptors: [],
    };
  }
  const inset = insetPolygon(normalizeWinding(polygon), design.margin);
  const bounds = polygonBounds(inset);
  if (inset.length < 3 || bounds.maxX - bounds.minX <= 0 || bounds.maxZ - bounds.minZ <= 0) {
    return {
      capacity: 0,
      bays: [],
      aisles: [],
      islands: [],
      poles: [],
      inset: [],
      origin: [0, 0],
      groundY: 0,
      asphaltY: 0.15,
      validationIssues: ['Boundary has no usable area after the required inset.'],
      gates: [],
      walkways: [],
      vehicleGraph: { nodes: [], edges: [] },
      navDescriptors: [],
    };
  }
  const rule = BAY_RULES[design.bayAngle];
  const angleDegrees = Number(design.bayAngle);
  const angle = (angleDegrees * Math.PI) / 180;
  const depth = rowDepth(rule, angle);
  const pitch = rowPitch(rule, angle);
  const aisleWidth = design.aisleWidth ?? (design.oneWay ? rule.aisleOneWay : rule.aisleTwoWay);
  const moduleLength = depth + aisleWidth + depth;
  const singleModule = depth + aisleWidth;

  // Baseline: longest inset edge, or the authored override.
  let baseline = design.baselineAngle;
  if (baseline === null) {
    let longest = 0;
    baseline = 0;
    for (let i = 0; i < inset.length; i++) {
      const a = inset[i]!;
      const b = inset[(i + 1) % inset.length]!;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length > longest) {
        longest = length;
        baseline = Math.atan2(b[1] - a[1], b[0] - a[0]);
      }
    }
  }
  const bAxis: Point2 = [Math.cos(baseline), Math.sin(baseline)];
  const nAxis: Point2 = [-Math.sin(baseline), Math.cos(baseline)];

  const project = (axis: Point2) =>
    inset.reduce<[number, number]>(
      (range, point) => {
        const value = point[0] * axis[0] + point[1] * axis[1];
        return [Math.min(range[0], value), Math.max(range[1], value)];
      },
      [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
    );
  const [nMin, nMax] = project(nAxis);
  const [bMin, bMax] = project(bAxis);

  interface RowSlot {
    n0: number;
    n1: number;
    towardAisle: 1 | -1;
    aisleN: number | null;
    row: number;
  }
  const slots: RowSlot[] = [];
  const aisles: ParkingAisle[] = [];
  let cursor = nMin;
  let row = 0;
  while (cursor + moduleLength <= nMax + 1e-6) {
    slots.push({
      n0: cursor,
      n1: cursor + depth,
      towardAisle: 1,
      aisleN: cursor + depth + aisleWidth / 2,
      row,
    });
    slots.push({
      n0: cursor + depth + aisleWidth,
      n1: cursor + moduleLength,
      towardAisle: -1,
      aisleN: cursor + depth + aisleWidth / 2,
      row: row + 1,
    });
    {
      const aisleN = cursor + depth + aisleWidth / 2;
      aisles.push({
        centerline: [
          [bAxis[0] * bMin + nAxis[0] * aisleN, bAxis[1] * bMin + nAxis[1] * aisleN],
          [bAxis[0] * bMax + nAxis[0] * aisleN, bAxis[1] * bMax + nAxis[1] * aisleN],
        ],
        width: aisleWidth,
        isOneWay: design.oneWay,
      });
    }
    cursor += moduleLength;
    row += 2;
  }
  if (cursor + singleModule <= nMax + 1e-6) {
    // A single-loaded row still works where a full double module no longer fits.
    slots.push({
      n0: cursor,
      n1: cursor + depth,
      towardAisle: 1,
      aisleN: cursor + depth + aisleWidth / 2,
      row,
    });
    const start = bAxis[0] * bMin + nAxis[0] * (cursor + depth + aisleWidth / 2);
    const startZ = bAxis[1] * bMin + nAxis[1] * (cursor + depth + aisleWidth / 2);
    const end = bAxis[0] * bMax + nAxis[0] * (cursor + depth + aisleWidth / 2);
    const endZ = bAxis[1] * bMax + nAxis[1] * (cursor + depth + aisleWidth / 2);
    aisles.push({
      centerline: [
        [start, startZ],
        [end, endZ],
      ],
      width: aisleWidth,
      isOneWay: design.oneWay,
    });
  }

  const islands: Point2[][] = [];
  const rawBays: ParkingBay[] = [];
  for (const slot of slots) {
    const along = Math.max(1, Math.floor((bMax - bMin) / pitch));
    let validInRow = 0;
    for (let index = 0; index < along; index++) {
      const offset = bMin + index * pitch;
      // The stall origin sits on the row's aisle-facing edge of the strip.
      const originN = slot.towardAisle === 1 ? slot.n0 : slot.n1;
      const origin: Point2 = [
        bAxis[0] * offset +
          nAxis[0] * originN -
          nAxis[0] *
            slot.towardAisle *
            (angle === 0 ? 0 : rule.stallWidth * Math.sin(Math.PI / 2 - angle)),
        bAxis[1] * offset +
          nAxis[1] * originN -
          nAxis[1] *
            slot.towardAisle *
            (angle === 0 ? 0 : rule.stallWidth * Math.sin(Math.PI / 2 - angle)),
      ];
      const { polygon: quad, depthDirection } = bayQuad(
        origin,
        bAxis,
        nAxis,
        rule,
        angle,
        slot.towardAisle,
      );
      if (!bayFits(quad, inset)) {
        // Partial corner candidates are omitted. An island is only emitted for actual medians.
        continue;
      }
      if (validInRow > 0 && validInRow % MEDIAN_EVERY === 0) {
        // A landscaped median breaks up long contiguous rows (spec §4.4).
        const center: Point2 = [
          origin[0] + bAxis[0] * pitch * 0.5,
          origin[1] + bAxis[1] * pitch * 0.5,
        ];
        islands.push([
          [center[0] - bAxis[0] * MEDIAN_WIDTH * 0.5, center[1] - bAxis[1] * MEDIAN_WIDTH * 0.5],
          [center[0] + bAxis[0] * MEDIAN_WIDTH * 0.5, center[1] + bAxis[1] * MEDIAN_WIDTH * 0.5],
          [
            center[0] + bAxis[0] * MEDIAN_WIDTH * 0.5 + depthDirection[0] * depth,
            center[1] + bAxis[1] * MEDIAN_WIDTH * 0.5 + depthDirection[1] * depth,
          ],
          [
            center[0] - bAxis[0] * MEDIAN_WIDTH * 0.5 + depthDirection[0] * depth,
            center[1] - bAxis[1] * MEDIAN_WIDTH * 0.5 + depthDirection[1] * depth,
          ],
        ]);
      }
      const center: Point2 = [
        quad.reduce((sum, point) => sum + point[0], 0) / 4,
        quad.reduce((sum, point) => sum + point[1], 0) / 4,
      ];
      rawBays.push({
        id: '',
        polygon: quad,
        center,
        yaw: Math.atan2(depthDirection[1], depthDirection[0]),
        type: 'standard',
        isOccupied: false,
        row: slot.row,
        u:
          (center[0] - polygonBounds(polygon).minX) /
          Math.max(1e-6, polygonBounds(polygon).maxX - polygonBounds(polygon).minX),
        v:
          (center[1] - polygonBounds(polygon).minZ) /
          Math.max(1e-6, polygonBounds(polygon).maxZ - polygonBounds(polygon).minZ),
        pinned: false,
        vehicle: null,
      });
      validInRow += 1;
    }
  }

  const numbered = rawBays.map((bay) => ({
    ...bay,
    id: `BAY-${bay.u.toFixed(4)}-${bay.v.toFixed(4)}`,
  }));
  const typed = applyOverrides(assignTypes(numbered), design);

  const random = mulberry32(design.seed);
  let vehicles = 0;
  const models: ParkingVehicle['model'][] = ['compact', 'sedan', 'suv', 'pickup'];
  const dimensions: Record<ParkingVehicle['model'], [number, number]> = {
    compact: [4.6, 1.8],
    sedan: [4.8, 1.9],
    suv: [4.1, 1.7],
    pickup: [5.2, 2.0],
  };
  const bays = typed.map((bay) => {
    const occupied =
      design.showVehicles &&
      vehicles < VEHICLE_CAP &&
      !['loading', 'motorcycle'].includes(bay.type) &&
      !bay.hatchFor &&
      random() < design.occupancy;
    let vehicle: ParkingVehicle | null = null;
    if (occupied) {
      const model = models[Math.floor(random() * models.length)]!;
      const [length, width] = dimensions[model];
      const vehicleRule = BAY_RULES[design.bayAngle];
      if (length <= vehicleRule.stallDepth && width <= vehicleRule.stallWidth) {
        vehicle = { id: `VEH-${bay.id}`, bayId: bay.id, model, length, width };
      }
    }
    if (vehicle) {
      vehicles += 1;
    }
    return { ...bay, isOccupied: vehicle !== null, vehicle };
  });

  const poles: Point2[] = [];
  if (design.showPoles) {
    const perimeter = normalizeWinding(polygon);
    for (let i = 0; i < perimeter.length; i++) {
      const a = perimeter[i]!;
      const b = perimeter[(i + 1) % perimeter.length]!;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let distance = POLE_SPACING / 2; distance < length; distance += POLE_SPACING) {
        poles.push([
          a[0] + ((b[0] - a[0]) * distance) / length,
          a[1] + ((b[1] - a[1]) * distance) / length,
        ]);
      }
    }
  }

  const areaTwice = polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  const clippedAisles = aisles.flatMap((aisle) => clipAisle(aisle, inset));
  const origin: Point2 = polygon
    .reduce(
      (sum, point, index) => {
        const next = polygon[(index + 1) % polygon.length]!;
        const cross = point[0] * next[1] - next[0] * point[1];
        return [sum[0] + (point[0] + next[0]) * cross, sum[1] + (point[1] + next[1]) * cross];
      },
      [0, 0] as Point2,
    )
    .map((value) => value / (3 * areaTwice)) as Point2;
  const vehicleGraph: VehicleGraph = { nodes: [], edges: [] };
  for (const aisle of clippedAisles) {
    const from = vehicleGraph.nodes.length;
    vehicleGraph.nodes.push(...aisle.centerline);
    vehicleGraph.edges.push([from, from + 1]);
  }
  // Join only physically touching aisle ends; this cannot bridge a concave notch.
  for (let a = 0; a < vehicleGraph.nodes.length; a++) {
    for (let b = a + 1; b < vehicleGraph.nodes.length; b++) {
      if (
        Math.hypot(
          vehicleGraph.nodes[a]![0] - vehicleGraph.nodes[b]![0],
          vehicleGraph.nodes[a]![1] - vehicleGraph.nodes[b]![1],
        ) < 0.5
      ) {
        vehicleGraph.edges.push([a, b]);
      }
    }
  }
  const gates: ParkingGate[] = [];
  const walkways: ParkingWalkway[] = [];
  const validationIssues: string[] = [];
  bays.forEach((bay) => {
    if (bay.typeWarning) {
      validationIssues.push(`${bay.id}: ${bay.typeWarning}`);
    }
  });
  const requiredAccessible = Math.ceil(bays.filter((bay) => !bay.hatchFor).length / 25);
  const actualAccessible = bays.filter((bay) => bay.type === 'accessible').length;
  if (actualAccessible < requiredAccessible) {
    validationIssues.push(
      `Accessible capacity is ${actualAccessible}; ${requiredAccessible} required for the current lot capacity.`,
    );
  }
  const perimeter = normalizeWinding(polygon);
  const gateCandidate = perimeter
    .map((a, edgeIndex) => {
      const b = perimeter[(edgeIndex + 1) % perimeter.length]!;
      return { a, b, edgeIndex, length: Math.hypot(b[0] - a[0], b[1] - a[1]) };
    })
    .filter((edge) => edge.length >= 6)
    .sort((a, b) => b.length - a.length)[0];
  if (!gateCandidate) {
    validationIssues.push(
      'No boundary edge is long enough for the minimum 3.5 m vehicle lane and clearance.',
    );
  }
  if (gateCandidate) {
    const { a, b, edgeIndex, length } = gateCandidate;
    const tangent: Point2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const inward: Point2 = [-tangent[1], tangent[0]];
    const center: Point2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const laneWidth = length >= 7 ? 7 : 3.5;
    gates.push({
      id: `GATE-${edgeIndex}`,
      edgeIndex,
      width: laneWidth,
      vehicleCenterline: [
        center,
        [
          center[0] + inward[0] * Math.max(3, design.margin + 2),
          center[1] + inward[1] * Math.max(3, design.margin + 2),
        ],
      ],
      pedestrianCenterline: [
        [b[0] - tangent[0] * 0.6, b[1] - tangent[1] * 0.6],
        [b[0] - tangent[0] * 0.6 + inward[0] * 2, b[1] - tangent[1] * 0.6 + inward[1] * 2],
      ],
    });
    walkways.push({ centerline: gates[0]!.pedestrianCenterline, width: 1.2 });
    const gateInner = gates[0]!.vehicleCenterline[1]!;
    const aisleEndpoints = clippedAisles.flatMap((aisle, aisleIndex) =>
      aisle.centerline.map((point, endpointIndex) => ({
        point,
        node: aisleIndex * 2 + endpointIndex,
      })),
    );
    const nearestVehicle = aisleEndpoints
      .map((candidate) => ({
        ...candidate,
        distance: Math.hypot(candidate.point[0] - gateInner[0], candidate.point[1] - gateInner[1]),
      }))
      .sort((left, right) => left.distance - right.distance)[0];
    if (nearestVehicle && corridorFits(gateInner, nearestVehicle.point, laneWidth, inset)) {
      const gateNode = vehicleGraph.nodes.length;
      vehicleGraph.nodes.push(gates[0]!.vehicleCenterline[0]!, gateInner);
      vehicleGraph.edges.push([gateNode, gateNode + 1]);
      vehicleGraph.edges.push([gateNode, nearestVehicle.node]);
      gates[0]!.isConnected = true;
    } else {
      gates[0]!.isConnected = false;
      validationIssues.push(
        'Vehicle entry gate does not connect to a drive aisle within the inset footprint.',
      );
    }
    const walkInner = gates[0]!.pedestrianCenterline[1]!;
    const nearestWalkway = aisleEndpoints
      .map((candidate) => ({
        ...candidate,
        distance: Math.hypot(candidate.point[0] - walkInner[0], candidate.point[1] - walkInner[1]),
      }))
      .sort((left, right) => left.distance - right.distance)[0];
    if (nearestWalkway && corridorFits(walkInner, nearestWalkway.point, 1.2, inset)) {
      walkways.push({ centerline: [walkInner, nearestWalkway.point], width: 1.2 });
    }
  }
  const navDescriptors: ParkingNavDescriptor[] = [
    ...clippedAisles.map((aisle) => ({
      polygon: corridorPolygon(aisle.centerline[0]!, aisle.centerline[1]!, aisle.width),
      kind: 'drive-aisle' as const,
      width: aisle.width,
    })),
    ...walkways.map((walkway) => ({
      polygon: corridorPolygon(walkway.centerline[0]!, walkway.centerline[1]!, walkway.width),
      kind: 'walkway' as const,
      width: walkway.width,
    })),
    ...gates.map((gate) => ({
      polygon: corridorPolygon(gate.vehicleCenterline[0]!, gate.vehicleCenterline[1]!, gate.width),
      kind: 'gate' as const,
      width: gate.width,
    })),
  ];
  return {
    capacity: bays.filter((bay) => !bay.hatchFor).length,
    bays,
    aisles: clippedAisles,
    islands,
    poles,
    inset,
    origin,
    groundY: 0,
    asphaltY: 0.15,
    validationIssues,
    gates,
    walkways,
    vehicleGraph,
    navDescriptors,
  };
}

/** Convenience wrapper taking the plan object directly. */
export function parkingLayout(object: Pick<PlanObject, 'polygon' | 'parkingDesign'>): LotLayout {
  return computeParkingLayout(object.polygon, parkingDesign(object));
}

export function parkingDesignError(object: PlanObject): string | null {
  if (object.recipe !== 'parking-lot') {
    return null;
  }
  const design = parkingDesign(object);
  if (!isSimplePolygon(object.polygon)) {
    return 'Parking lot boundary must be a simple polygon with non-zero area.';
  }
  const rule = BAY_RULES[design.bayAngle];
  const angle = (Number(design.bayAngle) * Math.PI) / 180;
  const depth = rowDepth(rule, angle);
  const aisleWidth = design.aisleWidth ?? (design.oneWay ? rule.aisleOneWay : rule.aisleTwoWay);
  const bounds = polygonBounds(object.polygon);
  const insetWidth = bounds.maxX - bounds.minX - 2 * design.margin;
  const insetDepth = bounds.maxZ - bounds.minZ - 2 * design.margin;
  if (insetWidth < rule.stallWidth + 1 || insetDepth < depth + aisleWidth) {
    return 'Parking lot footprint is too small for one stall row plus a drive aisle. Enlarge the boundary or reduce the inset margin.';
  }
  return null;
}
