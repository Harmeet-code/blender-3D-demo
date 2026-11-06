import {
  CAPSULE_TOTAL_HEIGHT_M,
  CHARACTER_CONFIG,
} from '../wayfinding/walkthrough/character-config.ts';
import {
  validateCapsuleEndpoint,
  validateCapsuleSweep,
} from '../wayfinding/walkthrough/collision/capsule-clearance.ts';
import {
  createPlanningNavigationContext,
  NAV_AGENT_RADIUS_M,
  NAV_PLANNING_RADIUS_M,
  planningSupportObstacles,
  type PlanningNavigationContext,
} from '../wayfinding/navigation/planning-context.ts';
import type { PortalType } from '@/features/building/model/building-schema.ts';
import type { AreaQueryFilter } from '@/features/building/model/navigation-protocol.ts';
import { NavigationClient } from '@/features/building/model/navigation-client.ts';
import {
  normalizeLayout,
  type NormalizedLayout,
} from '@/features/building/model/normalize-layout.ts';
import { encodeLayout } from './adapter.ts';
import type { PlanDocument } from './types.ts';
import { parseWorkerRoute } from '../wayfinding/model/route-schema.ts';
import type { WalkableZone } from '../wayfinding/model/zone-schema.ts';

export interface RoutePoint {
  floorId: string;
  point: [number, number];
}
export interface RouteSegment {
  floorId: string;
  points: [number, number][];
}
export interface PlanRoute {
  segments: RouteSegment[];
  distance: number;
  straight?: { floorId: string; points: [number, number][] }[];
  buildMs?: number;
}

export interface WayfindingPlanOptions {
  /** Walkable zones injected as in-memory authoring zones (never persisted). */
  walkableZones?: {
    id: string;
    floorId: string;
    polygon: [number, number][];
    holes?: [number, number][][];
  }[];
  /** Per-floor area paint pieces (zone type → area/flags). */
  navAreas?: Record<string, { polygon: [number, number][]; area: number; flags: number }[]>;
  queryFilter?: AreaQueryFilter;
  disabledPortals?: readonly string[];
  enabledPortalTypes?: readonly PortalType[];
  straight?: boolean;
  role?: 'staff' | 'visitor';
  /** Shared role-resolved geometry for worker input and every local clearance gate. */
  planningContext?: PlanningNavigationContext;
}

const ROUTING_BOUNDARY_MARGIN_M = 1;

function routingBoundary(
  fallback: [number, number][],
  zones: NonNullable<WayfindingPlanOptions['walkableZones']>,
): [number, number][] {
  const points = zones.flatMap((zone) => zone.polygon);
  if (!points.length || points.some((point) => !point.every(Number.isFinite))) {
    return fallback;
  }
  const xs = points.map(([x]) => x);
  const zs = points.map(([, z]) => z);
  const minX = Math.min(...xs) - ROUTING_BOUNDARY_MARGIN_M;
  const maxX = Math.max(...xs) + ROUTING_BOUNDARY_MARGIN_M;
  const minZ = Math.min(...zs) - ROUTING_BOUNDARY_MARGIN_M;
  const maxZ = Math.max(...zs) + ROUTING_BOUNDARY_MARGIN_M;
  return [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
}

interface PreparedNavigationLayout {
  document: PlanDocument;
  layout: NormalizedLayout;
  zonedFloors: ReadonlySet<string>;
}

/** Own worker lifetime; share Recast without sharing old viewer/editor state. */
export class StudioNavigator {
  private preparedLayouts = new WeakMap<PlanningNavigationContext, PreparedNavigationLayout>();
  private client = new NavigationClient(
    () =>
      new Worker(new URL('../../features/building/workers/navigation.worker.ts', import.meta.url), {
        type: 'module',
      }),
  );
  cancel() {
    this.client.cancel();
  }
  dispose() {
    this.client.dispose();
    this.preparedLayouts = new WeakMap();
  }
  async plan(
    document: PlanDocument,
    start: RoutePoint,
    end: RoutePoint,
    signal: AbortSignal,
    wayfinding?: WayfindingPlanOptions,
  ): Promise<PlanRoute> {
    const from = document.floors.find((floor) => floor.source.id === start.floorId);
    const to = document.floors.find((floor) => floor.source.id === end.floorId);
    if (!from || !to) {
      throw new Error('Start and destination must have clearance inside a walkable area.');
    }
    const role = wayfinding?.role ?? 'visitor';
    const fallbackZones: WalkableZone[] = (wayfinding?.walkableZones ?? []).map((zone) => ({
      ...zone,
      name: zone.id,
      type: 'general',
      holes: zone.holes ?? [],
      revision: 0,
    }));
    const planning =
      wayfinding?.planningContext ??
      createPlanningNavigationContext(document, fallbackZones, role);
    if (planning.buildingId !== document.baseline.buildingId || planning.role !== role) {
      throw new Error('Route planning geometry does not match the current building or role.');
    }
    const routingZones = planning.walkableZones;
    let prepared = this.preparedLayouts.get(planning);
    const zonedFloors = prepared?.document === document
      ? prepared.zonedFloors
      : new Set(routingZones.map((zone) => zone.floorId));
    if (!zonedFloors.has(start.floorId) || !zonedFloors.has(end.floorId)) {
      throw new Error('Draw a walkable zone on every route floor before planning a route.');
    }
    if (!prepared || prepared.document !== document) {
      const normalized = normalizeLayout(encodeLayout(document));
      if (normalized.isErr()) {
        throw new Error(normalized.error.message);
      }
      const objectIds = new Set(
        document.floors.flatMap((floor) => floor.objects.map((object) => object.id)),
      );
      const layout: NormalizedLayout = {
        ...normalized.value,
        portals: [...planning.portals],
        rooms: normalized.value.rooms.filter((room) => !objectIds.has(room.id)),
        floors: normalized.value.floors.map((floor) => {
          const physical = planning.collisionMaps.get(floor.id);
          if (!physical) {throw new Error(`Route planning geometry is missing floor ${floor.id}.`);}
          if (physical.unsupported.length) {
            const issue = physical.unsupported[0]!;
            const sourceFloor = document.floors.find((candidate) => candidate.source.id === floor.id);
            const objectId = issue.id.replace(/:\d+$/, '');
            const object = sourceFloor?.objects.find((candidate) => candidate.id === objectId);
            const shape = object ? `"${object.name}" (${issue.id})` : issue.id;
            throw new Error(
              `Route collision geometry on "${sourceFloor?.source.name ?? floor.id}" (${floor.id}) cannot represent ${shape}: ${issue.reason}`,
            );
          }
          const extraZones = routingZones.filter(
            (zone) => zone.floorId === floor.id,
          );
          return Object.assign({}, floor, {
            authoring: floor.authoring && {
              ...floor.authoring,
              boundary: routingBoundary(floor.authoring.boundary, extraZones),
              instances: [],
              zones: [
                ...(floor.authoring.zones ?? []).filter((zone) => zone.type !== 'walkable'),
                ...extraZones.map((zone) => ({
                  id: `fpb-walk:${zone.id}`,
                  label: zone.id,
                  type: 'walkable' as const,
                  polygon: zone.polygon,
                })),
              ],
              obstacles: [
                ...physical.obstacles.filter((item) => item.minY < physical.floorY + CAPSULE_TOTAL_HEIGHT_M && item.maxY > physical.floorY).map((item) => item.polygon.map(([x, z]): [number, number] => [x, z])),
                ...physical.blockedAreas.map((item) => item.polygon.map(([x, z]): [number, number] => [x, z])),
                ...extraZones.flatMap((zone) => zone.holes ?? []),
                ...planningSupportObstacles(physical),
              ],
            },
          });
        }),
      };
      prepared = { document, layout, zonedFloors };
      this.preparedLayouts.set(planning, prepared);
    }
    const { layout } = prepared;
    const disabledPortals = new Set(wayfinding?.disabledPortals ?? []);
    for (const portal of layout.portals) {
      const floorIds = portal.entries?.map((entry) => entry.floorId) ?? portal.connects;
      if (floorIds.some((floorId) => !zonedFloors.has(floorId))) {
        disabledPortals.add(portal.id);
      }
    }
    const profile = { ...CHARACTER_CONFIG, radiusM: NAV_AGENT_RADIUS_M };
    const endpointClear = (floorId: string, point: [number, number]) => {
      const floor = document.floors.find((item) => item.source.id === floorId);
      const map = planning.collisionMaps.get(floorId);
      return !!floor && !!map && validateCapsuleEndpoint(
        map,
        role,
        [point[0], floor.source.heightOffset, point[1]],
        profile,
      ).clear;
    };
    const endpointJoinClear = (
      floorId: string,
      a: [number, number],
      b: [number, number],
    ) => {
      const floor = document.floors.find((item) => item.source.id === floorId);
      const map = planning.collisionMaps.get(floorId);
      if (!floor || !map) {
        return false;
      }
      const y = floor.source.heightOffset;
      return validateCapsuleSweep(
        map,
        role,
        [a[0], y, a[1]],
        [b[0], y, b[1]],
        profile,
      ).clear;
    };
    if (
      !endpointClear(start.floorId, start.point) ||
      !endpointClear(end.floorId, end.point)
    ) {
      throw new Error(
        'Start and destination need clearance for the whole avatar in the walkable area.',
      );
    }
    const route = await this.client.query(
      layout,
      start.floorId,
      [start.point[0], from.source.heightOffset, start.point[1]],
      end.floorId,
      [end.point[0], to.source.heightOffset, end.point[1]],
      {
        signal,
        ...(wayfinding?.enabledPortalTypes
          ? { enabledPortalTypes: [...wayfinding.enabledPortalTypes] }
          : {}),
        ...(disabledPortals.size
          ? { disabledPortals: [...disabledPortals] }
          : {}),
        queryFilter: { ...wayfinding?.queryFilter, agentRadiusM: NAV_PLANNING_RADIUS_M },
        ...(wayfinding?.straight ? { straight: true } : {}),
        ...(Object.keys(planning.navAreas).length ? { navAreas: planning.navAreas } : {}),
      },
    );
    if (!route?.points.length) {
      throw new Error(
        'No walkable Recast route connects these locations. Check zones, obstacles and paired landings.',
      );
    }
    const validated = parseWorkerRoute(route);
    if (!validated.ok) {
      throw new Error(validated.error);
    }
    const segments: RouteSegment[] = [];
    let distance = 0;
    route.points.forEach((point, index) => {
      const floorId = route.floors[index] ?? start.floorId;
      if (segments.at(-1)?.floorId !== floorId) {
        segments.push({ floorId, points: [] });
      }
      segments.at(-1)!.points.push([point[0], point[2]]);
      if (index) {
        const prior = route.points[index - 1]!;
        distance += Math.hypot(point[0] - prior[0], point[1] - prior[1], point[2] - prior[2]);
      }
    });
    let straightSegments: { floorId: string; points: [number, number][] }[] | undefined;
    if (route.straight && route.straightFloors) {
      straightSegments = [];
      route.straight.forEach((point, index) => {
        const floorId = route.straightFloors![index] ?? start.floorId;
        if (straightSegments!.at(-1)?.floorId !== floorId) {
          straightSegments!.push({ floorId, points: [] });
        }
        straightSegments!.at(-1)!.points.push([point[0], point[2]]);
      });
      const startPoint = straightSegments[0]?.points[0],
        endPoint = straightSegments.at(-1)?.points.at(-1);
      if (
        !startPoint ||
        !endPoint ||
        !endpointJoinClear(start.floorId, start.point, startPoint) ||
        !endpointJoinClear(end.floorId, endPoint, end.point)
      ) {
        straightSegments = undefined;
      }
    }
    const first = segments[0]!,
      last = segments.at(-1)!;
    const firstPoint = first.points[0]!,
      lastPoint = last.points.at(-1)!;
    if (
      first.floorId !== start.floorId ||
      last.floorId !== end.floorId ||
      !endpointJoinClear(start.floorId, start.point, firstPoint) ||
      !endpointJoinClear(end.floorId, lastPoint, end.point)
    ) {
      throw new Error(
        'The chosen endpoint cannot safely reach the Recast path. Move the start or destination farther into a clear walkable area.',
      );
    }
    distance +=
      Math.hypot(start.point[0] - firstPoint[0], start.point[1] - firstPoint[1]) +
      Math.hypot(end.point[0] - lastPoint[0], end.point[1] - lastPoint[1]);
    first.points.unshift(start.point);
    last.points.push(end.point);
    return {
      segments,
      distance,
      ...(straightSegments ? { straight: straightSegments } : {}),
      ...(route.buildMs !== undefined ? { buildMs: route.buildMs } : {}),
    };
  }
}
