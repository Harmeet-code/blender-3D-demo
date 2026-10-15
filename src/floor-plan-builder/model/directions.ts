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
import { infoCounterLocal } from './information.ts';
import { exitCollisionFor } from './exit.ts';
import { isBooth, type PlanDocument } from './types.ts';

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
        return Object.assign({}, floor, {
          authoring: floor.authoring && {
            ...floor.authoring,
            instances: [],
            zones: [
              ...(floor.authoring.zones ?? []),
              ...((floor.authoring.zones ?? []).some((zone) => zone.type === 'walkable')
                ? [
                    ...source.objects.filter(isBooth).map((object) => ({
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
              ...source.objects
                .filter((object) => object.collidable)
                .flatMap((object) => {
                  if (isBooth(object)) {
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
                    return [objectPoints(object, infoCounterLocal(object))];
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
      { signal },
    );
    if (!route?.points.length) {
      throw new Error(
        'No walkable Recast route connects these locations. Check zones, obstacles and paired landings.',
      );
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
    return { segments, distance };
  }
}
