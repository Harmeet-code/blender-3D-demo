import type { PortalType } from '@/features/building/model/building-schema.ts';
import { NavigationClient } from '@/features/building/model/navigation-client.ts';
import { normalizeLayout } from '@/features/building/model/normalize-layout.ts';
import { isFloorPointClear } from '@/features/building/model/floor-point-clear.ts';
import { clearEndpointJoin } from './navigation-clearance.ts';
import { encodeLayout } from './adapter.ts';
import { footprint, objectPoints } from './geometry.ts';
import { boothNavigationPolygons } from './booth.ts';
import { tentCollisionLocal, tentWalkableLocal } from './tent.ts';
import { entranceCollisionLocal } from './entrance.ts';
import { washroomObstacleLocal } from './washroom.ts';
import { kidsObstacleLocal } from './kids.ts';
import { infoObstaclesLocal } from './information.ts';
import { exitCollisionFor } from './exit.ts';
import { benchObstacleLocal } from './bench.ts';
import { tableObstacleLocal } from './table.ts';
import { barrierObstacleLocal } from './barrier.ts';
import { planterObstacleLocal } from './planter.ts';
import { isBooth, isShellStructure, type PlanDocument } from './types.ts';
import { parseWorkerRoute } from '../wayfinding/model/route-schema.ts';

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
  queryFilter?: {
    includeFlags?: number;
    excludeFlags?: number;
    areaCosts?: readonly (readonly [number, number])[];
  };
  disabledPortals?: readonly string[];
  enabledPortalTypes?: readonly PortalType[];
  straight?: boolean;
}

/** Own worker lifetime; share Recast without sharing old viewer/editor state. */
export class StudioNavigator {
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
    const normalized = normalizeLayout(encodeLayout(document));
    if (normalized.isErr()) {
      throw new Error(normalized.error.message);
    }
    const objectIds = new Set(
      document.floors.flatMap((floor) => floor.objects.map((object) => object.id)),
    );
    const layout = {
      ...normalized.value,
      rooms: normalized.value.rooms.filter((room) => !objectIds.has(room.id)),
      floors: normalized.value.floors.map((floor) => {
        const source = document.floors.find((item) => item.source.id === floor.id)!;
        const extraZones = (wayfinding?.walkableZones ?? []).filter(
          (zone) => zone.floorId === floor.id,
        );
        return Object.assign({}, floor, {
          authoring: floor.authoring && {
            ...floor.authoring,
            instances: [],
            zones: [
              ...(floor.authoring.zones ?? []),
              ...extraZones.map((zone) => ({
                id: `fpb-walk:${zone.id}`,
                label: zone.id,
                type: 'walkable' as const,
                polygon: zone.polygon,
              })),
              ...((floor.authoring.zones ?? []).some((zone) => zone.type === 'walkable')
                ? [
                    ...source.objects
                      .filter((object) => isBooth(object) || isShellStructure(object))
                      .map((object) => ({
                      id: `fpb-interior:${object.id}`,
                      label: `${object.name} interior`,
                      type: 'walkable' as const,
                      polygon: footprint(object),
                      })),
                    ...source.objects
                      .filter((object) => object.recipe === 'barn-tent')
                      .map((object) => ({
                        id: `fpb-tent-interior:${object.id}`,
                        label: `${object.name} interior`,
                        type: 'walkable' as const,
                        polygon: objectPoints(object, tentWalkableLocal(object)),
                      })),
                  ]
                : []),
            ],
            obstacles: [
              ...floor.authoring.obstacles,
              ...extraZones.flatMap((zone) => zone.holes ?? []),
              ...source.objects
                .filter((object) => object.collidable)
                .flatMap((object) => {
                  if (isBooth(object) || isShellStructure(object)) {
                    return boothNavigationPolygons(object);
                  }
                  if (object.recipe === 'barn-tent') {
                    return tentCollisionLocal(object).map((polygon) =>
                      objectPoints(object, polygon),
                    );
                  }
                  if (object.recipe === 'entrance') {
                    return entranceCollisionLocal(object).map((polygon) =>
                      objectPoints(object, polygon),
                    );
                  }
                  if (object.recipe === 'washroom-men' || object.recipe === 'washroom-women') {
                    return [objectPoints(object, washroomObstacleLocal(object))];
                  }
                  if (object.recipe === 'kids-zone') {
                    return kidsObstacleLocal(object).map((polygon) =>
                      objectPoints(object, polygon),
                    );
                  }
                  if (object.recipe === 'exit') {
                    return exitCollisionFor(object).map((polygon) => objectPoints(object, polygon));
                  }
                  if (object.recipe === 'information') {
                    return infoObstaclesLocal(object).map((polygon) =>
                      objectPoints(object, polygon),
                    );
                  }
                  if (object.recipe === 'bench') {
                    return [objectPoints(object, benchObstacleLocal(object))];
                  }
                  if (object.recipe === 'table' || object.recipe === 'chair') {
                    return [objectPoints(object, tableObstacleLocal(object))];
                  }
                  if (object.recipe === 'barrier') {
                    return barrierObstacleLocal(object).map((polygon) =>
                      objectPoints(object, polygon),
                    );
                  }
                  if (object.recipe === 'planter') {
                    return [objectPoints(object, planterObstacleLocal(object))];
                  }
                  return [footprint(object)];
                }),
            ],
          },
        });
      }),
    };
    if (
      !isFloorPointClear(layout, start.floorId, start.point) ||
      !isFloorPointClear(layout, end.floorId, end.point)
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
        ...(wayfinding?.disabledPortals
          ? { disabledPortals: [...wayfinding.disabledPortals] }
          : {}),
        ...(wayfinding?.queryFilter ? { queryFilter: wayfinding.queryFilter } : {}),
        ...(wayfinding?.straight ? { straight: true } : {}),
        ...(wayfinding?.navAreas ? { navAreas: wayfinding.navAreas } : {}),
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
        !clearEndpointJoin(layout, start.floorId, start.point, startPoint) ||
        !clearEndpointJoin(layout, end.floorId, endPoint, end.point)
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
      !clearEndpointJoin(layout, start.floorId, start.point, firstPoint) ||
      !clearEndpointJoin(layout, end.floorId, lastPoint, end.point)
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
