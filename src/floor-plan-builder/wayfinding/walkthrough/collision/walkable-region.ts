import { sourceToMetres } from '@/features/building/model/floor-coordinates.ts';
import { polygonBounds } from '@/utils/geometry/polygon.ts';
import { objectPoints } from '../../../model/geometry.ts';
import type { PlanFloor, PlanZone } from '../../../model/types.ts';
import type { WalkableZone } from '../../model/zone-schema.ts';

export type RegionPoint2 = readonly [number, number];
export type RegionEdge = readonly [RegionPoint2, RegionPoint2];

export interface WalkableRegion {
  include: readonly (readonly RegionPoint2[])[];
  exclude: readonly (readonly RegionPoint2[])[];
  boundary: readonly RegionEdge[];
}

export interface FloorWalkableArea {
  id: string;
  polygon: readonly RegionPoint2[];
  holes: readonly (readonly RegionPoint2[])[];
}

export interface StrictWalkableRegion {
  region: WalkableRegion;
  valid: boolean;
  reason?: string;
}

export interface RegionMesh {
  vertices: Float32Array;
  indices: Uint32Array;
  surfaceIndices: Uint32Array;
}

const EPSILON = 1e-9;

const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;

function samePoint(a: RegionPoint2, b: RegionPoint2): boolean {
  return Math.abs(a[0] - b[0]) <= EPSILON && Math.abs(a[1] - b[1]) <= EPSILON;
}

function normalizeRing(ring: readonly RegionPoint2[]): RegionPoint2[] | null {
  if (!Array.isArray(ring)) {
    return null;
  }
  const points: RegionPoint2[] = [];
  for (const point of ring as readonly unknown[]) {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1])
    ) {
      return null;
    }
    points.push([point[0], point[1]]);
  }
  if (points.length > 3 && samePoint(points[0]!, points.at(-1)!)) {
    points.pop();
  }
  if (points.length < 3) {
    return null;
  }
  let twiceArea = 0;
  for (let index = 0; index < points.length; index++) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    if (samePoint(a, b)) {
      return null;
    }
    for (let other = index + 1; other < points.length; other++) {
      if (samePoint(a, points[other]!)) {
        return null;
      }
    }
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  if (Math.abs(twiceArea) <= EPSILON) {
    return null;
  }
  for (let index = 0; index < points.length; index++) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    for (let other = index + 1; other < points.length; other++) {
      const adjacent = other === index + 1 || (index === 0 && other === points.length - 1);
      if (adjacent) {
        continue;
      }
      const c = points[other]!;
      const d = points[(other + 1) % points.length]!;
      if (segmentDistance(a, b, c, d) <= EPSILON) {
        return null;
      }
    }
  }
  return points;
}

function pointSegmentDistance(point: RegionPoint2, a: RegionPoint2, b: RegionPoint2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSquared = dx * dx + dz * dz;
  const amount =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSquared,
          ),
        );
  return Math.hypot(point[0] - a[0] - amount * dx, point[1] - a[1] - amount * dz);
}

function segmentDistance(
  a: RegionPoint2,
  b: RegionPoint2,
  c: RegionPoint2,
  d: RegionPoint2,
): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const cdx = d[0] - c[0];
  const cdz = d[1] - c[1];
  const denominator = cross(abx, abz, cdx, cdz);
  const acx = c[0] - a[0];
  const acz = c[1] - a[1];
  if (Math.abs(denominator) > EPSILON) {
    const alongAB = cross(acx, acz, cdx, cdz) / denominator;
    const alongCD = cross(acx, acz, abx, abz) / denominator;
    if (
      alongAB >= -EPSILON &&
      alongAB <= 1 + EPSILON &&
      alongCD >= -EPSILON &&
      alongCD <= 1 + EPSILON
    ) {
      return 0;
    }
  } else if (Math.abs(cross(acx, acz, abx, abz)) <= EPSILON) {
    const lengthSquared = abx * abx + abz * abz;
    if (lengthSquared > EPSILON) {
      const first = (acx * abx + acz * abz) / lengthSquared;
      const second = ((d[0] - a[0]) * abx + (d[1] - a[1]) * abz) / lengthSquared;
      if (Math.max(Math.min(first, second), 0) <= Math.min(Math.max(first, second), 1) + EPSILON) {
        return 0;
      }
    }
  }
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

function pointInRing(point: RegionPoint2, ring: readonly RegionPoint2[], includeBoundary: boolean) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index]!;
    const b = ring[previous]!;
    if (includeBoundary && pointSegmentDistance(point, a, b) <= EPSILON) {
      return true;
    }
    if (
      (a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInRegionRings(
  point: RegionPoint2,
  include: readonly (readonly RegionPoint2[])[],
  exclude: readonly (readonly RegionPoint2[])[],
  includeBoundary: boolean,
) {
  return (
    include.some((ring) => pointInRing(point, ring, includeBoundary)) &&
    !exclude.some((ring) => pointInRing(point, ring, includeBoundary))
  );
}

function edgeCuts(edge: RegionEdge, other: RegionEdge): number[] {
  const [a, b] = edge;
  const [c, d] = other;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const sx = d[0] - c[0];
  const sz = d[1] - c[1];
  const denominator = cross(dx, dz, sx, sz);
  const qx = c[0] - a[0];
  const qz = c[1] - a[1];
  if (Math.abs(denominator) > EPSILON) {
    const amount = cross(qx, qz, sx, sz) / denominator;
    const otherAmount = cross(qx, qz, dx, dz) / denominator;
    return amount > EPSILON && amount < 1 - EPSILON && otherAmount >= -EPSILON && otherAmount <= 1 + EPSILON
      ? [amount]
      : [];
  }
  if (Math.abs(cross(qx, qz, dx, dz)) > EPSILON) {
    return [];
  }
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= EPSILON) {
    return [];
  }
  const cuts: number[] = [];
  for (const point of [c, d]) {
    const amount = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSquared;
    if (amount > EPSILON && amount < 1 - EPSILON) {
      cuts.push(amount);
    }
  }
  return cuts;
}

function pointKey(point: RegionPoint2): string {
  const precision = 1e8;
  return `${Math.round(point[0] * precision)},${Math.round(point[1] * precision)}`;
}

function unionBoundary(
  include: readonly (readonly RegionPoint2[])[],
  exclude: readonly (readonly RegionPoint2[])[],
): RegionEdge[] {
  const edges: RegionEdge[] = [...include, ...exclude].flatMap((ring) =>
    ring.map((point, index): RegionEdge => [point, ring[(index + 1) % ring.length]!]),
  );
  const result = new Map<string, RegionEdge>();
  for (const edge of edges) {
    const [a, b] = edge;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length <= EPSILON) {
      continue;
    }
    const cuts = [0, 1, ...edges.flatMap((other) => edgeCuts(edge, other))].sort(
      (left, right) => left - right,
    );
    const uniqueCuts = cuts.filter(
      (amount, index) => index === 0 || Math.abs(amount - cuts[index - 1]!) > EPSILON,
    );
    for (let index = 1; index < uniqueCuts.length; index++) {
      const from = uniqueCuts[index - 1]!;
      const to = uniqueCuts[index]!;
      if (to - from <= EPSILON) {
        continue;
      }
      let start: RegionPoint2 = [a[0] + dx * from, a[1] + dz * from];
      let end: RegionPoint2 = [a[0] + dx * to, a[1] + dz * to];
      const middle: RegionPoint2 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
      const normal: RegionPoint2 = [-dz / length, dx / length];
      let leftInside = false;
      let rightInside = false;
      let classified = false;
      let sampleDistance = Math.min(1e-5, length * 1e-5);
      for (let attempt = 0; attempt < 8; attempt++) {
        leftInside = pointInRegionRings(
          [middle[0] + normal[0] * sampleDistance, middle[1] + normal[1] * sampleDistance],
          include,
          exclude,
          false,
        );
        rightInside = pointInRegionRings(
          [middle[0] - normal[0] * sampleDistance, middle[1] - normal[1] * sampleDistance],
          include,
          exclude,
          false,
        );
        if (leftInside !== rightInside) {
          classified = true;
          break;
        }
        sampleDistance /= 10;
      }
      if (!classified) {
        continue;
      }
      if (rightInside) {
        [start, end] = [end, start];
      }
      result.set(`${pointKey(start)}>${pointKey(end)}`, [start, end]);
    }
  }
  return [...result.values()];
}

type HoleBearingPlanZone = PlanZone & {
  holes?: readonly (readonly [number, number][])[];
};

/** Canonical metric zones, with editable PlanFloor records taking precedence over source data. */
export function floorZonesInMetres(floor: PlanFloor): HoleBearingPlanZone[] {
  const zones = new Map<string, HoleBearingPlanZone>();
  for (const zone of floor.source.authoring?.zones ?? []) {
    const holes = (zone as HoleBearingPlanZone).holes;
    zones.set(zone.id, {
      ...zone,
      polygon: zone.polygon.map((point) =>
        sourceToMetres(point, floor.source.coordinateSystem),
      ),
      ...(holes ? {
        holes: holes.map((hole) =>
          hole.map((point) => sourceToMetres(point, floor.source.coordinateSystem)),
        ),
      } : {}),
    });
  }
  for (const zone of floor.zones ?? []) {
    zones.set(zone.id, zone as HoleBearingPlanZone);
  }
  return [...zones.values()];
}

export function floorWalkableAreas(
  floor: PlanFloor,
  mode: 'manual' | 'auto' = 'manual',
  walkableZones: readonly WalkableZone[] = [],
): FloorWalkableArea[] {
  const areas = new Map<string, FloorWalkableArea>();
  if (mode === 'manual') {
    areas.set(floor.source.id, { id: floor.source.id, polygon: floor.boundary, holes: [] });
  }
  for (const zone of floorZonesInMetres(floor)) {
    if (zone.type === 'walkable') {
      areas.set(zone.id, { id: zone.id, polygon: zone.polygon, holes: zone.holes ?? [] });
    }
  }
  for (const zone of walkableZones) {
    if (zone.floorId === floor.source.id) {
      areas.set(zone.id, { id: zone.id, polygon: zone.polygon, holes: zone.holes });
    }
  }
  return [...areas.values()];
}

/** The same inset apertures used by the visible and physical supporting surfaces. */
export function floorWashRackOpenings(floor: PlanFloor): RegionPoint2[][] {
  return floor.objects.flatMap((object) => {
    if (object.recipe !== 'wash-rack' || !object.washRackVariant) {
      return [];
    }
    const bounds = polygonBounds(object.polygon);
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    if (width <= EPSILON || depth <= EPSILON) {
      return [];
    }
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const inset = 0.02;
    const localInsetX = inset / Math.max(0.1, Math.abs(object.scale[0]));
    const localInsetZ = inset / Math.max(0.1, Math.abs(object.scale[2]));
    const factorX = Math.max(0.1, (width - 2 * localInsetX) / width);
    const factorZ = Math.max(0.1, (depth - 2 * localInsetZ) / depth);
    const insetPolygon = object.polygon.map(
      ([x, z]): [number, number] => [
        centerX + (x - centerX) * factorX,
        centerZ + (z - centerZ) * factorZ,
      ],
    );
    return [objectPoints(object, insetPolygon)];
  });
}

export function createWalkableRegion(
  includeRings: readonly (readonly RegionPoint2[])[],
  excludeRings: readonly (readonly RegionPoint2[])[] = [],
): WalkableRegion {
  const include = includeRings.flatMap((ring) => {
    const normalized = normalizeRing(ring);
    return normalized ? [normalized] : [];
  });
  const exclude = excludeRings.flatMap((ring) => {
    const normalized = normalizeRing(ring);
    return normalized ? [normalized] : [];
  });
  return { include, exclude, boundary: unionBoundary(include, exclude) };
}

/** Reject apertures that would be clipped, touch support edges, or overlap each other. */
export function createStrictWalkableRegion(
  includeRings: readonly (readonly RegionPoint2[])[],
  excludeRings: readonly (readonly RegionPoint2[])[] = [],
): StrictWalkableRegion {
  const base = createWalkableRegion(includeRings);
  const invalid = (reason: string): StrictWalkableRegion => ({ region: base, valid: false, reason });
  if (base.include.length !== includeRings.length || !base.boundary.length) {
    return invalid('The supporting floor or walkable-zone union is malformed.');
  }
  const holes = excludeRings.flatMap((ring) => {
    const normalized = normalizeRing(ring);
    return normalized ? [normalized] : [];
  });
  if (holes.length !== excludeRings.length) {
    return invalid('A support aperture is malformed.');
  }
  for (let index = 0; index < holes.length; index++) {
    const hole = holes[index]!;
    if (!hole.every((point) => pointInRegionRings(point, base.include, [], false))) {
      return invalid('A support aperture is not strictly inside the supporting union.');
    }
    const edges = hole.map((point, edge): RegionEdge => [point, hole[(edge + 1) % hole.length]!]);
    if (edges.some((edge) => base.boundary.some((boundary) => segmentDistance(...edge, ...boundary) <= EPSILON))) {
      return invalid('A support aperture touches or crosses the supporting union boundary.');
    }
    for (const other of holes.slice(0, index)) {
      const otherEdges = other.map((point, edge): RegionEdge => [point, other[(edge + 1) % other.length]!]);
      if (
        edges.some((edge) => otherEdges.some((otherEdge) => segmentDistance(...edge, ...otherEdge) <= EPSILON)) ||
        pointInRing(hole[0]!, other, false) ||
        pointInRing(other[0]!, hole, false)
      ) {
        return invalid('Support apertures touch, overlap, or contain one another.');
      }
    }
  }
  return {
    region: { include: base.include, exclude: holes, boundary: unionBoundary(base.include, holes) },
    valid: true,
  };
}

export function pointInWalkableRegion(point: RegionPoint2, region: WalkableRegion): boolean {
  return pointInRegionRings(point, region.include, region.exclude, true);
}

export function sweptDiskFitsWalkableRegion(
  region: WalkableRegion,
  from: RegionPoint2,
  to: RegionPoint2,
  radius: number,
): boolean {
  if (!pointInWalkableRegion(from, region) || !pointInWalkableRegion(to, region)) {
    return false;
  }
  return region.boundary.every(([a, b]) => segmentDistance(from, to, a, b) >= radius);
}

interface ScanBoundary {
  z: number;
  edge: RegionEdge;
}

interface ScanInterval {
  lower: ScanBoundary;
  upper: ScanBoundary;
}

function polygonIntervalsAtX(ring: readonly RegionPoint2[], x: number): ScanInterval[] {
  const hits: ScanBoundary[] = [];
  for (let index = 0; index < ring.length; index++) {
    const a = ring[index]!;
    const b = ring[(index + 1) % ring.length]!;
    if (!((a[0] <= x && x < b[0]) || (b[0] <= x && x < a[0]))) {
      continue;
    }
    const amount = (x - a[0]) / (b[0] - a[0]);
    hits.push({ z: a[1] + (b[1] - a[1]) * amount, edge: [a, b] });
  }
  hits.sort((left, right) => left.z - right.z);
  const intervals: ScanInterval[] = [];
  for (let index = 0; index + 1 < hits.length; index += 2) {
    const lower = hits[index]!;
    const upper = hits[index + 1]!;
    if (upper.z - lower.z > EPSILON) {
      intervals.push({ lower, upper });
    }
  }
  return intervals;
}

function unionIntervals(intervals: ScanInterval[]): ScanInterval[] {
  if (!intervals.length) {
    return [];
  }
  intervals.sort((left, right) => left.lower.z - right.lower.z || left.upper.z - right.upper.z);
  const result: ScanInterval[] = [];
  let current = { lower: intervals[0]!.lower, upper: intervals[0]!.upper };
  for (const interval of intervals.slice(1)) {
    if (interval.lower.z <= current.upper.z + EPSILON) {
      if (interval.upper.z > current.upper.z) {
        current.upper = interval.upper;
      }
    } else {
      result.push(current);
      current = { lower: interval.lower, upper: interval.upper };
    }
  }
  result.push(current);
  return result;
}

function subtractIntervals(include: ScanInterval[], exclude: ScanInterval[]): ScanInterval[] {
  const result: ScanInterval[] = [];
  for (const interval of include) {
    let { lower } = interval;
    for (const cut of exclude) {
      if (cut.upper.z <= lower.z + EPSILON) {
        continue;
      }
      if (cut.lower.z >= interval.upper.z - EPSILON) {
        break;
      }
      if (cut.lower.z > lower.z + EPSILON) {
        result.push({ lower, upper: cut.lower });
      }
      if (cut.upper.z >= interval.upper.z - EPSILON) {
        lower = interval.upper;
        break;
      }
      if (cut.upper.z > lower.z) {
        lower = cut.upper;
      }
    }
    if (interval.upper.z - lower.z > EPSILON) {
      result.push({ lower, upper: interval.upper });
    }
  }
  return result;
}

function boundaryAtX(boundary: ScanBoundary, x: number): number {
  const [a, b] = boundary.edge;
  const dx = b[0] - a[0];
  if (Math.abs(dx) <= EPSILON) {
    return boundary.z;
  }
  return a[1] + ((x - a[0]) / dx) * (b[1] - a[1]);
}

function uniqueCoordinates(values: number[]): number[] {
  values.sort((left, right) => left - right);
  return values.filter(
    (value, index) =>
      index === 0 ||
      Math.abs(value - values[index - 1]!) >
        EPSILON * Math.max(1, Math.abs(value), Math.abs(values[index - 1]!)),
  );
}

/** Non-overlapping vertical decomposition plus exterior side walls; overlaps never add coplanar faces. */
export function buildWalkableRegionMesh(
  region: WalkableRegion,
  bottom: number,
  top: number,
): RegionMesh | null {
  if (
    !region.include.length ||
    !region.boundary.length ||
    !Number.isFinite(bottom) ||
    !Number.isFinite(top) ||
    top <= bottom
  ) {
    return null;
  }
  const xCoordinates = uniqueCoordinates(
    region.boundary.flatMap(([a, b]) => [a[0], b[0]]),
  );
  const vertices: number[] = [];
  const indices: number[] = [];
  const surfaceIndices: number[] = [];
  let topTriangleCount = 0;
  const triangleArea = (a: RegionPoint2, b: RegionPoint2, c: RegionPoint2) =>
    Math.abs(cross(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1]));
  for (let index = 1; index < xCoordinates.length; index++) {
    const left = xCoordinates[index - 1]!;
    const right = xCoordinates[index]!;
    if (right - left <= EPSILON) {
      continue;
    }
    const middle = (left + right) / 2;
    const included = unionIntervals(
      region.include.flatMap((ring) => polygonIntervalsAtX(ring, middle)),
    );
    const excluded = unionIntervals(
      region.exclude.flatMap((ring) => polygonIntervalsAtX(ring, middle)),
    );
    for (const interval of subtractIntervals(included, excluded)) {
      const lowerLeft: RegionPoint2 = [left, boundaryAtX(interval.lower, left)];
      const lowerRight: RegionPoint2 = [right, boundaryAtX(interval.lower, right)];
      const upperRight: RegionPoint2 = [right, boundaryAtX(interval.upper, right)];
      const upperLeft: RegionPoint2 = [left, boundaryAtX(interval.upper, left)];
      if (
        ![...lowerLeft, ...lowerRight, ...upperRight, ...upperLeft].every(Number.isFinite) ||
        (upperLeft[1] - lowerLeft[1] <= EPSILON &&
          upperRight[1] - lowerRight[1] <= EPSILON)
      ) {
        continue;
      }
      const offset = vertices.length / 3;
      for (const [x, z] of [lowerLeft, lowerRight, upperRight, upperLeft]) {
        vertices.push(x, bottom, z);
      }
      for (const [x, z] of [lowerLeft, lowerRight, upperRight, upperLeft]) {
        vertices.push(x, top, z);
      }
      if (triangleArea(lowerLeft, upperRight, lowerRight) > EPSILON) {
        indices.push(offset + 4, offset + 6, offset + 5, offset, offset + 1, offset + 2);
        surfaceIndices.push(offset + 4, offset + 6, offset + 5);
        topTriangleCount++;
      }
      if (triangleArea(lowerLeft, upperLeft, upperRight) > EPSILON) {
        indices.push(offset + 4, offset + 7, offset + 6, offset, offset + 2, offset + 3);
        surfaceIndices.push(offset + 4, offset + 7, offset + 6);
        topTriangleCount++;
      }
    }
  }
  if (!topTriangleCount) {
    return null;
  }
  for (const [a, b] of region.boundary) {
    const offset = vertices.length / 3;
    vertices.push(
      a[0], bottom, a[1],
      b[0], bottom, b[1],
      a[0], top, a[1],
      b[0], top, b[1],
    );
    indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
    surfaceIndices: new Uint32Array(surfaceIndices),
  };
}
