import type { PlanDocument, PlanFloor } from '../../model/types.ts';
import type { Portal } from '@/features/building/model/building-schema.ts';
import type { NavAreaPaint } from '../model/route-schema.ts';
import type { WalkableZone } from '../model/zone-schema.ts';
import {
  buildCollisionMap,
  CAPSULE_CLEARANCE_EPSILON_M,
  physicalFloor,
  type CollisionMap,
  type RoleAreaPolicy,
} from '../walkthrough/collision/capsule-clearance.ts';
import {
  buildWalkableRegionMesh,
  createWalkableRegion,
} from '../walkthrough/collision/walkable-region.ts';
import {
  authoredConnectorLegs,
  connectorRecordForLeg,
  liveConnectorPortals,
  type ConnectorPoint,
  type ConnectorRecord,
} from '../walkthrough/connectors/connector-runtime.ts';
import type { Role } from '../walkthrough/contracts.ts';
import { buildFloorNavInput, type FloorNavInput, type Point2, ZONE_AREA } from './input-builder.ts';

export const NAV_AGENT_RADIUS_M = 0.4;
export const NAV_AGENT_DIAMETER_M = NAV_AGENT_RADIUS_M * 2;
// Recast rasterizes this project at 0.1 m. Plan one cell wider so contour
// simplification cannot return a centerline that fails the exact 0.4 m sweep.
export const NAV_PLANNING_RADIUS_M = NAV_AGENT_RADIUS_M + 0.1;

/** Carve apertures out of floor routing while retaining same-level stair landings. */
export function planningSupportObstacles(map: CollisionMap): Point2[][] {
  return (map.supportHoles ?? []).flatMap((hole): Point2[][] => {
    const connector = map.connectorHoles?.find((candidate) => candidate.polygon === hole);
    const landings = connector
      ? (map.landingSupports ?? [])
          .filter((surface) =>
            surface.connectorId === connector.connectorId &&
            Math.abs(surface.y - map.floorY) <= CAPSULE_CLEARANCE_EPSILON_M,
          )
          .map((surface) => surface.polygon)
      : [];
    if (!landings.length) {
      return [hole.map(([x, z]): Point2 => [x, z])];
    }
    const unsupported = createWalkableRegion([hole], landings);
    const mesh = buildWalkableRegionMesh(unsupported, -0.1, 0);
    if (!mesh) {
      return [];
    }
    const polygons: Point2[][] = [];
    for (let index = 0; index < mesh.surfaceIndices.length; index += 3) {
      polygons.push([0, 1, 2].map((offset): Point2 => {
        const vertex = mesh.surfaceIndices[index + offset]! * 3;
        return [mesh.vertices[vertex]!, mesh.vertices[vertex + 2]!];
      }));
    }
    return polygons;
  });
}

export interface PlanningWalkableZone {
  id: string;
  floorId: string;
  polygon: Point2[];
  holes: Point2[][];
}

export interface PlanningNavigationContext {
  buildingId: string;
  portals: readonly Portal[];
  role: Role;
  accessibleOnly: boolean;
  zones: WalkableZone[];
  walkableZones: PlanningWalkableZone[];
  navAreas: Record<string, NavAreaPaint[]>;
  floorInputs: ReadonlyMap<string, FloorNavInput>;
  collisionMaps: ReadonlyMap<string, CollisionMap>;
  connectorRecords: readonly ConnectorRecord[];
  eligibleConnectorRecords: readonly ConnectorRecord[];
}

const finitePoint = (point: ConnectorPoint) => point.length === 3 && point.every(Number.isFinite);
const distance3 = (a: ConnectorPoint, b: ConnectorPoint) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function connectorNavigationWidthM(record: ConnectorRecord): number {
  if (record.kind !== 'elevator') {
    return record.path?.widthM ?? 0;
  }
  const object = record.elevator?.object;
  if (!object) {
    return 0;
  }
  return Math.min(
    object.dimensions[0] * object.scale[0] - 0.35,
    object.dimensions[2] * object.scale[2] - 0.35,
  );
}

export function connectorTraversalPoints(
  record: ConnectorRecord,
  fromFloorId: string,
  toFloorId: string,
): ConnectorPoint[] | null {
  const from = record.stops.find((stop) => stop.floorId === fromFloorId);
  const to = record.stops.find((stop) => stop.floorId === toFloorId);
  if (!from || !to || from === to) {
    return null;
  }
  const authored = record.kind === 'elevator' ? record.elevator?.points : record.path?.points;
  if (!authored || authored.length < 2 || !authored.every(finitePoint)) {
    return null;
  }
  const firstDistance = distance3(authored[0]!, from.entry);
  const lastDistance = distance3(authored.at(-1)!, from.entry);
  const oriented = firstDistance <= lastDistance ? [...authored] : [...authored].reverse();
  const tolerance = record.kind === 'elevator' ? 0.001 : 0.75;
  if (
    distance3(oriented[0]!, from.entry) > tolerance ||
    distance3(oriented.at(-1)!, to.entry) > tolerance
  ) {
    return null;
  }
  return [from.entry, ...oriented, to.entry].filter(
    (point, index, points) => !index || distance3(point, points[index - 1]!) > 1e-6,
  );
}

export function connectorRecordSupportsNavigation(
  record: ConnectorRecord,
  role: Role,
  accessibleOnly: boolean,
  fromFloorId?: string,
  toFloorId?: string,
): boolean {
  if (
    !record.id ||
    !record.portalId ||
    !record.enabled ||
    record.unavailableReason ||
    record.stops.length < 2 ||
    record.stops.some((stop) => !stop.floorId || !finitePoint(stop.entry)) ||
    (record.allowedRoles && !record.allowedRoles.includes(role)) ||
    connectorNavigationWidthM(record) < NAV_AGENT_DIAMETER_M
  ) {
    return false;
  }
  if (accessibleOnly && (!record.accessible || (record.kind !== 'ramp' && record.kind !== 'elevator'))) {
    return false;
  }
  if (record.kind === 'elevator') {
    if (!record.elevator || !Number.isFinite(record.transferSeconds) || record.transferSeconds! <= 0) {
      return false;
    }
  } else if (
    !record.path ||
    record.path.authoredInstanceId !== record.id ||
    !Number.isFinite(record.path.widthM) ||
    (record.speedMps !== undefined && (!Number.isFinite(record.speedMps) || record.speedMps <= 0))
  ) {
    return false;
  }
  const from = fromFloorId ?? record.stops[0]?.floorId;
  const to = toFloorId ?? record.stops[1]?.floorId;
  if (!from || !to || from === to) {
    return false;
  }
  if (
    record.kind === 'escalator' &&
    (record.stops[0]?.floorId !== from || record.stops.at(-1)?.floorId !== to)
  ) {
    return false;
  }
  return connectorTraversalPoints(record, from, to) !== null;
}

function withoutDocumentWalkableZones(floor: PlanFloor): PlanFloor {
  const authoring = floor.source.authoring;
  return {
    ...floor,
    zones: floor.zones.filter((zone) => zone.type !== 'walkable'),
    source: authoring
      ? {
          ...floor.source,
          authoring: {
            ...authoring,
            zones: (authoring.zones ?? []).filter((zone) => zone.type !== 'walkable'),
          },
        }
      : floor.source,
  };
}

export function createPlanningNavigationContext(
  document: PlanDocument,
  zones: WalkableZone[],
  role: Role,
  accessibleOnly = false,
): PlanningNavigationContext {
  // The baseline is the imported document; linked/moved instances are encoded
  // from live authoring state. Resolve exactly the portals the worker receives.
  const portals = liveConnectorPortals(document);
  const connectorRecords = authoredConnectorLegs(document, portals).flatMap((leg) => {
    const record = connectorRecordForLeg(leg, document, portals);
    return record ? [record] : [];
  });
  const eligibleConnectorRecords = connectorRecords.filter((record) =>
    connectorRecordSupportsNavigation(record, role, accessibleOnly),
  );
  const walkableZones = zones
    .filter((zone) => zone.type !== 'restricted')
    .map((zone): PlanningWalkableZone => ({
      id: zone.id,
      floorId: zone.floorId,
      polygon: zone.polygon as Point2[],
      holes: zone.holes as Point2[][],
    }));
  const positiveZones = zones.filter((zone) => zone.type !== 'restricted');
  const floorInputs = new Map<string, FloorNavInput>();
  const collisionMaps = new Map<string, CollisionMap>();
  const navAreas: Record<string, NavAreaPaint[]> = {};

  for (const floor of document.floors) {
    const physical = physicalFloor(
      floor,
      document.floors,
      eligibleConnectorRecords,
      role,
      new Set<string>(),
    );
    const input = buildFloorNavInput(
      floor.source.id,
      floor.boundary as Point2[],
      zones,
      physical.objects,
      false,
    );
    floorInputs.set(floor.source.id, input);
    if (input.areas.length) {
      navAreas[floor.source.id] = input.areas;
    }
    const roleAreas: RoleAreaPolicy[] = input.areas
      .filter((area) => area.flags === ZONE_AREA.restricted.flags)
      .map((area, index): RoleAreaPolicy => ({
        id: `restricted:${floor.source.id}:${index}`,
        floorId: floor.source.id,
        polygon: area.polygon,
        allowedRoles: ['staff'],
      }));
    collisionMaps.set(
      floor.source.id,
      buildCollisionMap(withoutDocumentWalkableZones(physical), roleAreas, 'auto', {
        floors: document.floors,
        connectors: eligibleConnectorRecords,
        role,
        walkableZones: positiveZones,
      }),
    );
  }

  return {
    buildingId: document.baseline.buildingId,
    portals,
    role,
    accessibleOnly,
    zones,
    walkableZones,
    navAreas,
    floorInputs,
    collisionMaps,
    connectorRecords,
    eligibleConnectorRecords,
  };
}
