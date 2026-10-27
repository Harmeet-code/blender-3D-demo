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
    return { point: [point[0] + nx * margin, point[1] + nz * margin] as Point2, dx: dx / length, dz: dz / length };
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
    const bounds = polygonBounds(ccw);
    return [
      [bounds.minX + margin, bounds.minZ + margin],
      [bounds.maxX - margin, bounds.minZ + margin],
      [bounds.maxX - margin, bounds.maxZ - margin],
      [bounds.minX + margin, bounds.maxZ - margin],
    ].filter(() => bounds.maxX - bounds.minX > 2 * margin && bounds.maxZ - bounds.minZ > 2 * margin) as Point2[];
  }
  return inset;
}

/** Stall strip depth perpendicular to the aisle (angled stalls contribute their width projection). */
function rowDepth(rule: BayRule, angle: number): number {
  return angle === 0 ? rule.stallWidth : rule.stallDepth * Math.sin(angle) + rule.stallWidth * Math.cos(angle);
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
    const depth = [nAxis[0] * towardAisle * rule.stallWidth, nAxis[1] * towardAisle * rule.stallWidth] as Point2;
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
  const width = [widthDirection[0] * rule.stallWidth, widthDirection[1] * rule.stallWidth] as Point2;
  const depth = [depthDirection[0] * rule.stallDepth, depthDirection[1] * rule.stallDepth] as Point2;
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

/** 85% containment rule (spec §4.4): a candidate needs most sample points inside the inset lot. */
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
  const inside = samples.filter((point) => pointInPolygon(point, inset)).length;
  return inside / samples.length >= 0.85;
}

function assignTypes(bays: ParkingBay[]): ParkingBay[] {
  const capacity = bays.length;
  if (capacity === 0) {
    return bays;
  }
  const accessible = capacity >= 8 ? Math.min(Math.round(capacity * 0.08), Math.max(1, Math.round(capacity / 12))) : 0;
  const ev = capacity >= 10 ? Math.max(1, Math.round(capacity * 0.075)) : 0;
  const motorcycle = capacity >= 20 ? Math.max(1, Math.round(capacity * 0.03)) : 0;
  const assigned = bays.map((bay) => ({ ...bay, type: 'standard' as ParkingBayType }));
  // Accessible bays sit at the head of the outermost rows, closest to the walkways.
  for (let i = 0; i < accessible; i++) {
    const target = i % 2 === 0 ? i / 2 : assigned.length - 1 - (i - 1) / 2;
    const bay = assigned[target];
    if (bay && bay.type === 'standard') {
      bay.type = 'accessible';
    }
  }
  // EV chargers and motorcycle slots spread deterministically across the remaining bays.
  let placed = 0;
  for (let index = 1; index < assigned.length && placed < ev; index += Math.max(2, Math.floor(assigned.length / (ev + 1)))) {
    if (assigned[index]!.type === 'standard') {
      assigned[index]!.type = 'ev';
      placed += 1;
    }
  }
  placed = 0;
  for (let index = Math.floor(assigned.length / 2); index < assigned.length && placed < motorcycle; index += Math.max(3, Math.floor(assigned.length / (motorcycle + 1)))) {
    if (assigned[index]!.type === 'standard') {
      assigned[index]!.type = 'motorcycle';
      placed += 1;
    }
  }
  return assigned;
}

function applyOverrides(bays: ParkingBay[], design: ParkingDesign, bounds: ReturnType<typeof polygonBounds>): ParkingBay[] {
  const entries = Object.entries(design.overrides);
  if (entries.length === 0) {
    return bays;
  }
  const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
  const spanZ = Math.max(1e-6, bounds.maxZ - bounds.minZ);
  return bays.map((bay) => {
    const u = (bay.center[0] - bounds.minX) / spanX;
    const v = (bay.center[1] - bounds.minZ) / spanZ;
    const key = `${u.toFixed(2)},${v.toFixed(2)}`;
    const type = design.overrides[key];
    return type ? { ...bay, type } : bay;
  });
}

/** Generate the full layout manifest for a lot polygon and design. */
export function computeParkingLayout(polygon: Point2[], source: ParkingDesign): LotLayout {
  const design = source ?? DEFAULT_PARKING;
  const inset = insetPolygon(normalizeWinding(polygon), design.margin);
  const bounds = polygonBounds(inset);
  if (inset.length < 3 || bounds.maxX - bounds.minX <= 0 || bounds.maxZ - bounds.minZ <= 0) {
    return { capacity: 0, bays: [], aisles: [], islands: [], poles: [], inset: [] };
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
    slots.push({ n0: cursor, n1: cursor + depth, towardAisle: 1, aisleN: cursor + depth + aisleWidth / 2, row });
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
    slots.push({ n0: cursor, n1: cursor + depth, towardAisle: 1, aisleN: cursor + depth + aisleWidth / 2, row });
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
        bAxis[0] * offset + nAxis[0] * originN - nAxis[0] * slot.towardAisle * (angle === 0 ? 0 : (rule.stallWidth * Math.sin(Math.PI / 2 - angle))),
        bAxis[1] * offset + nAxis[1] * originN - nAxis[1] * slot.towardAisle * (angle === 0 ? 0 : (rule.stallWidth * Math.sin(Math.PI / 2 - angle))),
      ];
      const { polygon: quad, depthDirection } = bayQuad(origin, bAxis, nAxis, rule, angle, slot.towardAisle);
      if (!bayFits(quad, inset)) {
        // Sliver or corner candidate: convert into a landscaped island (spec §4.4).
        islands.push(quad);
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
          [center[0] + bAxis[0] * MEDIAN_WIDTH * 0.5 + depthDirection[0] * depth, center[1] + bAxis[1] * MEDIAN_WIDTH * 0.5 + depthDirection[1] * depth],
          [center[0] - bAxis[0] * MEDIAN_WIDTH * 0.5 + depthDirection[0] * depth, center[1] - bAxis[1] * MEDIAN_WIDTH * 0.5 + depthDirection[1] * depth],
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
      });
      validInRow += 1;
    }
  }

  const rowCounts = new Map<number, number>();
  const letter = (value: number) => String.fromCharCode(65 + (value % 26));
  const numbered = rawBays.map((bay) => {
    const count = (rowCounts.get(bay.row) ?? 0) + 1;
    rowCounts.set(bay.row, count);
    return { ...bay, id: `BAY-${letter(bay.row)}-${String(count).padStart(2, '0')}` };
  });
  const typed = applyOverrides(assignTypes(numbered), design, polygonBounds(polygon));

  const random = mulberry32(design.seed);
  let vehicles = 0;
  const bays = typed.map((bay) => {
    const occupied =
      design.showVehicles &&
      vehicles < VEHICLE_CAP &&
      bay.type !== 'loading' &&
      random() < design.occupancy;
    if (occupied) {
      vehicles += 1;
    }
    return { ...bay, isOccupied: occupied };
  });

  const poles: Point2[] = [];
  if (design.showPoles) {
    const perimeter = normalizeWinding(polygon);
    for (let i = 0; i < perimeter.length; i++) {
      const a = perimeter[i]!;
      const b = perimeter[(i + 1) % perimeter.length]!;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let distance = POLE_SPACING / 2; distance < length; distance += POLE_SPACING) {
        poles.push([a[0] + ((b[0] - a[0]) * distance) / length, a[1] + ((b[1] - a[1]) * distance) / length]);
      }
    }
  }

  return { capacity: bays.length, bays, aisles, islands, poles, inset };
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
