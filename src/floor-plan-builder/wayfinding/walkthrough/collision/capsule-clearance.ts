import { sourceToMetres } from '@/features/building/model/floor-coordinates.ts';
import { authoredConnectorLegs, connectorRecordForLeg, type ConnectorRecord } from '../connectors/connector-runtime.ts';
import { createConnectorSurfaceProxy } from './connector-proxies.ts';
import type { PlanDocument } from '../../../model/types.ts';
import { objectPoints } from '../../../model/geometry.ts';
import type { WalkableZone } from '../../model/zone-schema.ts';
import type { PlanFloor } from '@/floor-plan-builder/model/types.ts';
import { objectObstaclePolygons, visualHeight } from '@/floor-plan-builder/model/geometry.ts';
import { authoredWallBoxes } from '@/features/building/model/authored-walls.ts';
import { authoredInstancePhysical } from '@/features/building/model/authored-instance-physical.ts';
import { boothPhysical, boxFootprint } from '@/features/building/model/booth-physical.ts';
import type { Role } from '../contracts.ts';
import { CHARACTER_CONFIG, CAPSULE_TOTAL_HEIGHT_M } from '../character-config.ts';
import {
  createWalkableRegion,
  createStrictWalkableRegion,
  floorWalkableAreas,
  floorWashRackOpenings,
  floorZonesInMetres,
  pointInWalkableRegion,
  sweptDiskFitsWalkableRegion,
  type WalkableRegion,
} from './walkable-region.ts';

export type Point2 = readonly [number, number];
export type Point3 = readonly [number, number, number];

export interface RoleAreaPolicy {
  id: string;
  floorId?: string;
  polygon: readonly Point2[];
  allowedRoles?: readonly Role[];
}

export interface CollisionPolygon {
  id: string;
  source: 'plan-object' | 'authored-obstacle' | 'blocked-zone' | 'authored-wall' | 'booth' | 'instance';
  polygon: readonly Point2[];
  minY: number;
  maxY: number;
}

export interface CollisionMap {
  floorId: string;
  floorY: number;
  supportHoles?: readonly (readonly Point2[])[];
  connectorHoles?: readonly { connectorId: string; polygon: readonly Point2[] }[];
  landingSupports?: readonly { connectorId?: string; polygon: readonly Point2[]; y: number }[];
  supportRegion?: WalkableRegion;
  supportValid?: boolean;
  /** Manual maps contain floor + positive zones; planning maps contain positive zones only. */
  walkableSurfaces?: readonly (readonly Point2[])[];
  walkableRegion?: WalkableRegion;
  boundary: readonly Point2[];
  obstacles: readonly CollisionPolygon[];
  blockedAreas: readonly CollisionPolygon[];
  roleAreas: readonly RoleAreaPolicy[];
  unsupported: readonly { id: string; reason: string }[];
}

export interface ClearanceResult {
  clear: boolean;
  reason?: string;
  blockerId?: string;
  source?: CollisionPolygon['source'] | 'floor-boundary' | 'role-area' | 'unknown-geometry';
}

export interface CapsuleProfile {
  radiusM: number;
  heightM: number;
}

export interface CollisionSupportOptions {
  floors?: readonly PlanFloor[];
  connectors?: readonly ConnectorRecord[];
  role?: Role;
  originY?: number;
  walkableZones?: readonly WalkableZone[];
}

export interface FloorSupportPolicy {
  walkableSurfaces: readonly (readonly Point2[])[];
  walkableRegion: WalkableRegion;
  supportRegion: WalkableRegion;
  openings: readonly (readonly Point2[])[];
  permanentHoles: readonly (readonly Point2[])[];
  connectorHoles: readonly { connectorId: string; polygon: readonly Point2[] }[];
  landingSupports: readonly { connectorId: string; polygon: readonly Point2[]; y: number }[];
  unsupported: readonly { id: string; reason: string }[];
  valid: boolean;
}

const DEFAULT_PROFILE: CapsuleProfile = {
  radiusM: CHARACTER_CONFIG.radiusM,
  heightM: CAPSULE_TOTAL_HEIGHT_M,
};
/** Allow only a 0.1 mm numerical tolerance at the canonical hard-clearance boundary. */
export const CAPSULE_CLEARANCE_EPSILON_M = 1e-4;
const finite = (n: number) => Number.isFinite(n);

interface CollisionPolygonNormalization {
  polygon: Point2[] | null;
  problem: string | null;
}

function normalizeCollisionPolygonWithReason(
  polygon: readonly Point2[],
): CollisionPolygonNormalization {
  const invalid = (problem: string): CollisionPolygonNormalization => ({ polygon: null, problem });
  if (!Array.isArray(polygon)) {return invalid('footprint is not a vertex array');}
  const points: Point2[] = [];
  for (const [index, point] of (polygon as readonly unknown[]).entries()) {
    if (!Array.isArray(point) || point.length !== 2 || !finite(point[0]) || !finite(point[1])) {
      return invalid(`vertex ${index + 1} must be a finite [x, z] pair`);
    }
    points.push([point[0], point[1]]);
  }
  // Authored rings sometimes repeat the first vertex to signal closure. Canonicalize
  // that representation so both planar tests and triangulation see the same ring.
  if (points.length > 3 && samePoint(points[0]!, points.at(-1)!)) {points.pop();}
  if (points.length < 3) {return invalid(`footprint has ${points.length} distinct vertices; at least 3 are required`);}
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length;
    if (samePoint(points[i]!, points[next]!)) {
      return invalid(`vertices ${i + 1} and ${next + 1} are identical`);
    }
    for (let j = i + 1; j < points.length; j++) {
      if (samePoint(points[i]!, points[j]!)) {
        return invalid(`vertex ${j + 1} duplicates vertex ${i + 1}`);
      }
    }
  }
  for (let i = 0; i < points.length; i++) {
    const previous = points[(i + points.length - 1) % points.length]!;
    const current = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const toPrevious: Point2 = [previous[0] - current[0], previous[1] - current[1]];
    const toNext: Point2 = [next[0] - current[0], next[1] - current[1]];
    const cross = toPrevious[0] * toNext[1] - toPrevious[1] * toNext[0];
    const dot = toPrevious[0] * toNext[0] + toPrevious[1] * toNext[1];
    const scale = Math.max(1, Math.hypot(...toPrevious) * Math.hypot(...toNext));
    // Collinear rays from the shared vertex that point the same way mean the
    // adjacent edges overlap beyond that vertex (a backtracking spike).
    if (Math.abs(cross) <= 1e-9 * scale && dot > 0) {
      return invalid(`vertex ${i + 1} creates an overlapping backtracking edge`);
    }
  }
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  if (!finite(twiceArea) || Math.abs(twiceArea) <= 1e-10) {
    return invalid('footprint encloses no measurable area');
  }
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    for (let j = i + 1; j < points.length; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === points.length - 1);
      if (adjacent) {continue;}
      const c = points[j]!, d = points[(j + 1) % points.length]!;
      if (segmentDistance(a, b, c, d) <= 1e-9) {
        return invalid(`edges ${i + 1} and ${j + 1} touch or intersect`);
      }
    }
  }
  return { polygon: points, problem: null };
}

/** Return the canonical simple ring shared by clearance and Rapier proxy generation. */
export function normalizeCollisionPolygon(polygon: readonly Point2[]): Point2[] | null {
  return normalizeCollisionPolygonWithReason(polygon).polygon;
}

export function isValidCollisionPolygon(polygon: readonly Point2[]): boolean {
  return normalizeCollisionPolygon(polygon) !== null;
}

function samePoint(a: Point2, b: Point2): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function pointSegmentDistance(p: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSq));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

function segmentDistance(a: Point2, b: Point2, c: Point2, d: Point2): number {
  const orient = (p: Point2, q: Point2, r: Point2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  const onSegment = (p: Point2, q: Point2, r: Point2) =>
    q[0] >= Math.min(p[0], r[0]) - 1e-9 && q[0] <= Math.max(p[0], r[0]) + 1e-9 &&
    q[1] >= Math.min(p[1], r[1]) - 1e-9 && q[1] <= Math.max(p[1], r[1]) + 1e-9;
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) {return 0;}
  if ((Math.abs(o1) <= 1e-9 && onSegment(a, c, b)) || (Math.abs(o2) <= 1e-9 && onSegment(a, d, b)) ||
      (Math.abs(o3) <= 1e-9 && onSegment(c, a, d)) || (Math.abs(o4) <= 1e-9 && onSegment(c, b, d))) {return 0;}
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

function inside(point: Point2, polygon: readonly Point2[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) {result = !result;}
  }
  return result;
}

function segmentHitsPolygon(a: Point2, b: Point2, polygon: readonly Point2[], radius: number): boolean {
  if (inside(a, polygon) || inside(b, polygon)) {return true;}
  for (let i = 0; i < polygon.length; i++) {
    if (segmentDistance(a, b, polygon[i]!, polygon[(i + 1) % polygon.length]!) < radius) {return true;}
  }
  return false;
}

function addPolygon(
  list: CollisionPolygon[], id: string, source: CollisionPolygon['source'], polygon: readonly Point2[], minY: number, maxY: number,
  unsupported: { id: string; reason: string }[],
) {
  const footprint = normalizeCollisionPolygonWithReason(polygon);
  let normalized = footprint.polygon;
  // Triangulated authored instances can emit microscopic slivers. Keep their
  // occupied space with a conservative prism instead of denying the whole floor.
  if (!normalized && source === 'instance' && polygon.length >= 3 && polygon.every((point) => point.length === 2 && point.every(finite))) {
    const xs = polygon.map((point) => point[0]), zs = polygon.map((point) => point[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    if (maxX - minX <= CAPSULE_CLEARANCE_EPSILON_M && maxZ - minZ <= CAPSULE_CLEARANCE_EPSILON_M) {
      const pad = CAPSULE_CLEARANCE_EPSILON_M;
      normalized = [[minX - pad, minZ - pad], [maxX + pad, minZ - pad], [maxX + pad, maxZ + pad], [minX - pad, maxZ + pad]];
    }
  }
  if (!normalized || !finite(minY) || !finite(maxY) || maxY <= minY) {
    const problems = [
      ...(!normalized ? [footprint.problem ?? 'footprint is malformed'] : []),
      ...(!finite(minY) || !finite(maxY)
        ? [`vertical extent [${String(minY)}, ${String(maxY)}] must contain finite values`]
        : maxY <= minY
          ? [`vertical extent [${minY}, ${maxY}] must have positive height`]
          : []),
    ];
    unsupported.push({
      id,
      reason: `${source} collision shape is unrepresentable: ${problems.join('; ')}.`,
    });
    return;
  }
  list.push({ id, source, polygon: normalized, minY, maxY });
}

/** Same explicit connector eligibility for planning and playback. */
export function physicalConnectorIds(connectors: readonly ConnectorRecord[], role: Role): Set<string> {
  return new Set(connectors.filter((record) => record.enabled && !record.unavailableReason &&
    record.stops.length >= 2 && record.stops.every((stop) => stop.floorId && stop.entry.every(finite)) &&
    (!record.allowedRoles || record.allowedRoles.includes(role)) &&
    (record.kind === 'elevator' ? !!record.elevator : createConnectorSurfaceProxy(record, CHARACTER_CONFIG.radiusM * 2).supported)).map((record) => record.id));
}

function connectorObjectForFloor(
  floor: PlanFloor,
  floors: readonly PlanFloor[],
  record: ConnectorRecord,
) {
  const matchesRecord = (object: PlanFloor['objects'][number]) =>
    object.id === record.id ||
    (object.portalId === record.portalId &&
      (object.recipe === record.kind || (record.kind === 'ramp' && object.recipe === 'stairs')));
  const snapshotFloor = floors.find((item) => item.source.id === floor.source.id);
  return floor.objects.find(matchesRecord) ??
    snapshotFloor?.objects.find(matchesRecord) ??
    floors.flatMap((item) => item.objects).find(matchesRecord) ??
    record.elevator?.object;
}

/** One normalized support contract for rendering, analytic clearance, and Rapier slabs. */
export function buildFloorSupportPolicy(
  floor: PlanFloor,
  floors: readonly PlanFloor[],
  connectors: readonly ConnectorRecord[],
  role: Role,
  options: {
    mode?: 'manual' | 'auto';
    originY?: number;
    walkableZones?: readonly WalkableZone[];
  } = {},
): FloorSupportPolicy {
  const mode = options.mode ?? 'manual';
  const originY = options.originY ?? 0;
  const areas = floorWalkableAreas(floor, mode, options.walkableZones);
  const unsupported: { id: string; reason: string }[] = [];
  const walkableSurfaces: Point2[][] = [];
  const permanentCandidates: { id: string; polygon: readonly Point2[] }[] = [];
  for (const area of areas) {
    const polygon = normalizeCollisionPolygon(area.polygon);
    if (!polygon) {
      unsupported.push({ id: area.id, reason: 'Supporting floor or walkable-zone footprint is malformed.' });
      continue;
    }
    walkableSurfaces.push(polygon);
    area.holes.forEach((hole, index) => permanentCandidates.push({
      id: `${area.id}:hole:${index}`,
      polygon: hole,
    }));
  }
  floorWashRackOpenings(floor).forEach((polygon, index) => permanentCandidates.push({
    id: `${floor.source.id}:wash-rack-opening:${index}`,
    polygon,
  }));

  const eligible = physicalConnectorIds(connectors, role);
  const connectorCandidates: { id: string; connectorId: string; polygon: readonly Point2[] }[] = [];
  for (const [recordIndex, record] of connectors.entries()) {
    if (!eligible.has(record.id) || connectors.findIndex((item) => item.id === record.id) !== recordIndex) {
      continue;
    }
    const low = Math.min(...record.stops.map((stop) => stop.entry[1])) + originY;
    const high = Math.max(...record.stops.map((stop) => stop.entry[1])) + originY;
    if (floor.source.heightOffset <= low + CAPSULE_CLEARANCE_EPSILON_M ||
        floor.source.heightOffset > high + CAPSULE_CLEARANCE_EPSILON_M) {
      continue;
    }
    const object = connectorObjectForFloor(floor, floors, record);
    if (!object) {
      unsupported.push({ id: record.id, reason: 'Eligible connector has no snapshot-bound aperture footprint.' });
      continue;
    }
    connectorCandidates.push({
      id: `${record.id}:opening:${floor.source.id}`,
      connectorId: record.id,
      polygon: objectPoints(object, object.polygon),
    });
  }

  const candidates = [...permanentCandidates, ...connectorCandidates];
  const strict = createStrictWalkableRegion(
    walkableSurfaces,
    candidates.map((candidate) => candidate.polygon),
  );
  if (!strict.valid) {
    unsupported.push({
      id: floor.source.id,
      reason: strict.reason ?? 'The floor support apertures are invalid.',
    });
  }
  const openings = strict.valid ? strict.region.exclude : [];
  const permanentHoles = openings.slice(0, permanentCandidates.length);
  const connectorHoles = strict.valid
    ? connectorCandidates.map((candidate, index) => ({
        connectorId: candidate.connectorId,
        polygon: openings[permanentCandidates.length + index]!,
      }))
    : [];
  const landingSupports = connectors
    .filter((record) => eligible.has(record.id))
    .flatMap((record) => [...(record.path?.landings ?? []), ...(record.path?.treads ?? [])].map((surface) => ({
      connectorId: record.id,
      polygon: surface.polygon,
      y: surface.y + originY,
    })));
  return {
    walkableSurfaces,
    walkableRegion: createWalkableRegion(walkableSurfaces),
    supportRegion: strict.region,
    openings,
    permanentHoles,
    connectorHoles,
    landingSupports,
    unsupported,
    valid: strict.valid && unsupported.length === 0,
  };
}

export function physicalFloor(floor: PlanFloor, floors: readonly PlanFloor[], connectors: readonly ConnectorRecord[], role: Role, openDoors: ReadonlySet<string>): PlanFloor {
  const ids = physicalConnectorIds(connectors, role);
  const removed = new Set(floors.flatMap((item) => item.objects.filter((object) => ids.has(object.id) ||
    (object.circulationDesign?.role === 'upper' && connectors.some((record) => ids.has(record.id) && record.portalId === object.portalId && record.kind === object.recipe))).map((object) => object.id)));
  return { ...floor,
    objects: floor.objects.filter((object) => !removed.has(object.id)).map((object) => object.recipe === 'entrance' && object.entranceGate === 'arch-sliding-doors' ? { ...object, entranceOpen: openDoors.has(object.id) } : object),
    source: floor.source.authoring ? { ...floor.source, authoring: { ...floor.source.authoring, instances: floor.source.authoring.instances?.filter((instance) => !ids.has(instance.id) && !removed.has(instance.id)) } } : floor.source,
  };
}

export function planningPhysicalFloor(document: PlanDocument, floor: PlanFloor, role: Role): PlanFloor {
  const connectors = authoredConnectorLegs(document).flatMap((leg) => {
    const record = connectorRecordForLeg(leg, document);
    return record ? [record] : [];
  });
  // Planning never assumes an animated sliding door has already opened.
  return physicalFloor(floor, document.floors, connectors, role, new Set());
}

/** Planning can prove slab/landing support, but never assumes an elevator cabin pose. */
export function buildPlanningCollisionMap(
  document: PlanDocument,
  floor: PlanFloor,
  role: Role,
  walkableZones: readonly WalkableZone[] = [],
): CollisionMap {
  const connectors = authoredConnectorLegs(document).flatMap((leg) => {
    const record = connectorRecordForLeg(leg, document);
    return record ? [record] : [];
  });
  return buildCollisionMap(planningPhysicalFloor(document, floor, role), [], 'auto', {
    floors: document.floors,
    connectors,
    role,
    walkableZones,
  });
}

/** Map document geometry to conservative, source-linked collision prisms. */
export function buildCollisionMap(
  floor: PlanFloor,
  roleAreas: readonly RoleAreaPolicy[] = [],
  mode: 'manual' | 'auto' = 'manual',
  supportOptions: CollisionSupportOptions = {},
): CollisionMap {
  const y = floor.source.heightOffset;
  const obstacles: CollisionPolygon[] = [], blockedAreas: CollisionPolygon[] = [];
  const support = buildFloorSupportPolicy(
    floor,
    supportOptions.floors ?? [floor],
    supportOptions.connectors ?? [],
    supportOptions.role ?? 'visitor',
    {
      mode,
      originY: supportOptions.originY,
      walkableZones: supportOptions.walkableZones,
    },
  );
  const unsupported: { id: string; reason: string }[] = [...support.unsupported];
  const boundary = normalizeCollisionPolygon(floor.boundary);
  if (!boundary) {unsupported.push({ id: floor.source.id, reason: 'Floor boundary is unavailable or malformed.' });}
  if (!finite(y)) {unsupported.push({ id: floor.source.id, reason: 'Floor vertical position is malformed.' });}
  const normalizedRoleAreas: RoleAreaPolicy[] = [];
  if (!Array.isArray(roleAreas)) {
    unsupported.push({ id: floor.source.id, reason: 'Role-area policy list is malformed.' });
  } else {
    for (const [index, area] of roleAreas.entries()) {
      if (area?.floorId !== undefined && area.floorId !== floor.source.id) {continue;}
      const polygon = area && normalizeCollisionPolygon(area.polygon);
      const roles = area?.allowedRoles;
      const validRoles = Array.isArray(roles) && roles.every((role) => role === 'staff' || role === 'visitor');
      if (!area || typeof area.id !== 'string' || !area.id.trim() || !polygon || !validRoles) {
        unsupported.push({ id: typeof area?.id === 'string' && area.id.trim() ? area.id : `role-area:${index}`, reason: 'Role-area policy is missing a valid ID, polygon, or explicit allow-list.' });
        continue;
      }
      normalizedRoleAreas.push({ id: area.id, polygon, allowedRoles: roles });
    }
  }

  const siblings = floor.objects;
  for (const object of siblings) {
    if (!object.managed && floor.source.authoring?.instances?.some((instance) => instance.id === object.id)) {continue;}
    const polygons = objectObstaclePolygons(object, siblings);
    if (object.collidable && polygons.length === 0) {unsupported.push({ id: object.id, reason: 'Collidable object has no supported physical footprint.' });}
    for (const [index, polygon] of polygons.entries()) {
      addPolygon(obstacles, `${object.id}:${index}`, 'plan-object', polygon, y, y + visualHeight(object), unsupported);
    }
  }

  for (const [index, polygon] of (floor.source.authoring?.obstacles ?? []).entries()) {
    addPolygon(obstacles, `authoring-obstacle:${index}`, 'authored-obstacle', polygon, y, y + 3, unsupported);
  }
  for (const zone of floorZonesInMetres(floor)) {
    if (zone.type === 'blocked') {addPolygon(blockedAreas, zone.id, 'blocked-zone', zone.polygon, y, y + 3, unsupported);}
  }
  for (const wall of floor.source.authoring?.walls ?? []) {
    for (const [index, box] of authoredWallBoxes(wall).entries()) {
      addPolygon(obstacles, `${wall.id}:${index}`, 'authored-wall', boxFootprint(box), y + box.position[1] - box.halfExtents[1], y + box.position[1] + box.halfExtents[1], unsupported);
    }
  }
  for (const room of floor.referenceRooms ?? []) {
    if (room.type !== 'booth') {continue;}
    const managed = floor.source.authoring?.instances?.some((instance) => instance.id === room.id);
    if (managed) {continue;}
    for (const [index, box] of boothPhysical(room).boxes.entries()) {
      addPolygon(obstacles, `${room.id}:${index}`, 'booth', boxFootprint(box), y + box.position[1] - box.halfExtents[1], y + box.position[1] + box.halfExtents[1], unsupported);
    }
  }
  for (const instance of floor.source.authoring?.instances ?? []) {
    if (!(floor.objects.find((object) => object.id === instance.id)?.collidable ?? instance.collidable)) {continue;}
    // Managed objects use their current PlanObject geometry exactly once. Imported
    // assets retain their physical provider, with the current editable transform.
    const object = floor.objects.find((object) => object.id === instance.id);
    if (object?.managed || object?.recipe === 'entrance') {continue;}
    const physicalInstance = { ...instance, position: object?.position ?? sourceToMetres(instance.position, floor.source.coordinateSystem),
      yawRadians: object?.yawRadians ?? instance.yawRadians, scale: object?.scale ?? instance.scale, dimensions: object?.dimensions ?? instance.dimensions, collidable: object?.collidable ?? instance.collidable };
    try {
      for (const [index, box] of authoredInstancePhysical(physicalInstance).boxes.entries()) {
        addPolygon(obstacles, `${instance.id}:${index}`, 'instance', box.footprint, y + box.minY, y + box.maxY, unsupported);
      }
    } catch {
      unsupported.push({ id: instance.id, reason: 'Authored instance geometry could not be resolved.' });
    }
  }
  return {
    floorId: floor.source.id,
    floorY: y,
    boundary: boundary ?? [],
    supportHoles: support.openings,
    connectorHoles: support.connectorHoles,
    landingSupports: support.landingSupports,
    supportRegion: support.supportRegion,
    supportValid: support.valid,
    walkableSurfaces: support.walkableSurfaces,
    walkableRegion: support.walkableRegion,
    obstacles,
    blockedAreas,
    roleAreas: normalizedRoleAreas,
    unsupported,
  };
}

/** One capsule sweep contract for free motion, route samples, endpoints, and landings. */
export function validateCapsuleSweep(
  map: CollisionMap,
  role: Role,
  fromFeet: Point3,
  toFeet: Point3,
  profile: CapsuleProfile = DEFAULT_PROFILE,
): ClearanceResult {
  if (![...fromFeet, ...toFeet, profile.radiusM, profile.heightM].every(finite) || profile.radiusM <= 0 || profile.heightM <= profile.radiusM * 2) {
    return { clear: false, reason: 'Capsule pose or dimensions are invalid.', source: 'unknown-geometry' };
  }
  if (map.unsupported.length) {
    const issue = map.unsupported[0]!;
    return { clear: false, reason: issue.reason, blockerId: issue.id, source: 'unknown-geometry' };
  }
  const requiredRadiusM = profile.radiusM - CAPSULE_CLEARANCE_EPSILON_M;
  if (requiredRadiusM <= 0) {
    return { clear: false, reason: 'Capsule radius is below the clearance tolerance.', source: 'unknown-geometry' };
  }
  const a: Point2 = [fromFeet[0], fromFeet[2]], b: Point2 = [toFeet[0], toFeet[2]];
  const walkableRegion = map.walkableRegion ?? createWalkableRegion(
    map.walkableSurfaces ?? (map.boundary.length ? [map.boundary] : []),
  );
  if (!sweptDiskFitsWalkableRegion(walkableRegion, a, b, requiredRadiusM)) {
    return { clear: false, reason: 'The capsule does not fit on the supported floor or walkable-zone union.', source: 'floor-boundary' };
  }
  const crossedSupportHoles = map.supportHoles?.filter((hole) =>
    segmentHitsPolygon(a, b, hole, requiredRadiusM),
  ) ?? [];
  for (const hole of crossedSupportHoles) {
    const connectorHole = map.connectorHoles?.find((candidate) => candidate.polygon === hole);
    if (!connectorHole) {
      return { clear: false, reason: 'The capsule crosses an unsupported floor aperture.', source: 'floor-boundary' };
    }
    // Only the part of the aperture not covered by a same-level landing is
    // unsupported. The rest of the sweep may remain on the surrounding slab.
    const unsupportedRegion = createWalkableRegion(
      [hole],
      (map.landingSupports ?? [])
        .filter(
          (surface) =>
            surface.connectorId === connectorHole.connectorId &&
            Math.abs(surface.y - fromFeet[1]) <= CAPSULE_CLEARANCE_EPSILON_M &&
            Math.abs(surface.y - toFeet[1]) <= CAPSULE_CLEARANCE_EPSILON_M,
        )
        .map((surface) => surface.polygon),
    );
    if (
      pointInWalkableRegion(a, unsupportedRegion) ||
      pointInWalkableRegion(b, unsupportedRegion) ||
      unsupportedRegion.boundary.some(([start, end]) =>
        segmentDistance(a, b, start, end) < requiredRadiusM,
      )
    ) {
      return { clear: false, reason: 'The capsule crosses an unsupported floor aperture.', source: 'floor-boundary' };
    }
  }
  const minY = Math.min(fromFeet[1], toFeet[1]);
  const maxY = Math.max(fromFeet[1], toFeet[1]) + profile.heightM;
  for (const area of map.roleAreas) {
    if (!area.allowedRoles || area.allowedRoles.includes(role)) {continue;}
    if (segmentHitsPolygon(a, b, area.polygon, requiredRadiusM)) {
      return { clear: false, reason: `Role ${role} cannot enter area ${area.id}.`, blockerId: area.id, source: 'role-area' };
    }
  }
  for (const item of [...map.blockedAreas, ...map.obstacles]) {
    if (item.maxY <= minY || item.minY >= maxY) {continue;}
    if (segmentHitsPolygon(a, b, item.polygon, requiredRadiusM)) {
      return { clear: false, reason: `Capsule sweep intersects ${item.id}.`, blockerId: item.id, source: item.source };
    }
  }
  return { clear: true };
}

export function validateCapsuleEndpoint(map: CollisionMap, role: Role, feet: Point3, profile?: CapsuleProfile) {
  const occupancy = validateCapsuleSweep(map, role, feet, feet, profile);
  if (!occupancy.clear) {return occupancy;}
  const point: Point2 = [feet[0], feet[2]];
  for (const hole of map.supportHoles ?? []) {
    if (!inside(point, hole)) {continue;}
    const connectorHole = map.connectorHoles?.find((candidate) => candidate.polygon === hole);
    if (!connectorHole || !map.landingSupports?.some((surface) =>
      surface.connectorId === connectorHole.connectorId &&
      Math.abs(surface.y - feet[1]) <= CAPSULE_CLEARANCE_EPSILON_M &&
      inside(point, surface.polygon))) {
      return { clear: false, reason: 'Choose a supported floor or connector landing.', source: 'floor-boundary' as const };
    }
  }
  return occupancy;
}

