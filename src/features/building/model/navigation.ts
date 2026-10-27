import { init, Raw, NavMeshQuery, QueryFilter, type NavMesh } from '@recast-navigation/core';
import { generateSoloNavMesh } from '@recast-navigation/generators';
import { generateAreaNavMesh } from './area-navmesh.ts';
import { ShapeUtils, Vector2 } from 'three';
import type { PortalType } from './building-schema.ts';
import type { NormalizedLayout } from '@/features/building/model/normalize-layout.ts';
import { boothPhysical, boxFootprint } from './booth-physical.ts';
import { navigationFloorKey } from './navigation-revision.ts';
import { authoredWallBoxes } from './authored-walls.ts';
import { authoredInstancePhysical } from './authored-instance-physical.ts';
import { managedBoothInstanceIds } from './managed-plan-object.ts';
import { authoredWalkableSurfaces } from './walkable-surfaces.ts';
import type { NavAreaPaint as AreaPaint, AreaQueryFilter } from './navigation-protocol.ts';
export type { NavAreaPaint as AreaPaint, AreaQueryFilter } from './navigation-protocol.ts';

export type RoutePoint = [number, number, number];

export type RouteResult =
  | { ok: true; points: RoutePoint[]; straight?: RoutePoint[] }
  | { ok: false; reason: 'NO_MESH' | 'NO_PATH' | 'OUTSIDE_MESH' };

function buildQueryFilter(filter?: AreaQueryFilter): QueryFilter | undefined {
  if (!filter) {
    return undefined;
  }
  const query = new QueryFilter();
  if (filter.includeFlags !== undefined) {
    query.includeFlags = filter.includeFlags;
  }
  if (filter.excludeFlags !== undefined) {
    query.excludeFlags = filter.excludeFlags;
  }
  for (const [area, cost] of filter.areaCosts ?? []) {
    query.setAreaCost(area, cost);
  }
  return query;
}

/** Area payload participates in the cached mesh key, including removal of all paints. */
function paintHash(paints: AreaPaint[]): string {
  return paints
    .map(
      (paint) =>
        `${paint.area}:${paint.flags}:${paint.polygon.map((point) => point.join(',')).join(';')}`,
    )
    .join('|');
}

/** Recast agent radius that still fits the 4 m booth grid. */
const PROJECTION_EXTENTS = { x: 2, y: 4, z: 2 };

let initPromise: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  initPromise ??= init();
  return initPromise;
}

interface CachedFloorMesh {
  signature: string;
  areaSignature: string;
  query: NavMeshQuery;
  mesh: NavMesh;
}

const floorMeshes = new Map<string, CachedFloorMesh>();

export function clearNavigationCache(nextLayout?: NormalizedLayout) {
  for (const [floorId, { query, mesh, signature }] of floorMeshes) {
    if (
      nextLayout &&
      nextLayout.floors.some((floor) => floor.id === floorId) &&
      navigationFloorKey(nextLayout, floorId) === signature
    ) {
      continue;
    }
    query.destroy();
    mesh.destroy();
    floorMeshes.delete(floorId);
  }
}

/**
 * Triangulate one room polygon (world XZ at floor height) into mesh buffers.
 * World X follows polygon X and world Z follows polygon Y, matching FloorStack.
 */
function appendRoom(
  polygon: ReadonlyArray<readonly [number, number]>,
  positions: number[],
  indices: number[],
): void {
  const contour = polygon.map(([x, z]) => new Vector2(x, z));
  const base = positions.length / 3;
  for (const point of contour) {
    positions.push(point.x, 0, point.y);
  }
  for (const face of ShapeUtils.triangulateShape(contour, [])) {
    const [a, b, c] = face;
    if (a === undefined || b === undefined || c === undefined) {
      continue;
    }
    const ax = positions[(base + a) * 3] as number;
    const az = positions[(base + a) * 3 + 2] as number;
    const bx = positions[(base + b) * 3] as number;
    const bz = positions[(base + b) * 3 + 2] as number;
    const cx = positions[(base + c) * 3] as number;
    const cz = positions[(base + c) * 3 + 2] as number;
    // Recast keeps only upward-facing triangles; flip downward winding.
    const normalY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (normalY < 0) {
      indices.push(base + a, base + c, base + b);
    } else {
      indices.push(base + a, base + b, base + c);
    }
  }
}

async function floorQuery(
  layout: NormalizedLayout,
  floorId: string,
  paints: AreaPaint[] = [],
  wayfinding = false,
): Promise<NavMeshQuery | null> {
  const cached = floorMeshes.get(floorId);
  const signature = navigationFloorKey(layout, floorId);
  const areaSignature = `${wayfinding ? '0.4m:' : 'legacy:'}${paintHash(paints)}`;
  if (cached && cached.signature === signature && cached.areaSignature === areaSignature) {
    return cached.query;
  }
  const positions: number[] = [];
  const indices: number[] = [];
  const floor = layout.floors.find((item) => item.id === floorId);
  const authoring = floor?.authoring;
  if (authoring) {
    const managedBooths = floor ? managedBoothInstanceIds(floor) : new Set<string>();
    for (const surface of authoredWalkableSurfaces(authoring)) {
      appendRoom(surface, positions, indices);
    }
    const solid = (polygon: Array<[number, number]>, bottom = 0, height = 3) => {
      const top = positions.length / 3;
      appendRoom(polygon, positions, indices);
      for (let i = top * 3 + 1; i < positions.length; i += 3) {
        positions[i] = bottom + height;
      }
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!,
          b = polygon[(i + 1) % polygon.length]!;
        const base = positions.length / 3;
        positions.push(
          a[0],
          bottom,
          a[1],
          b[0],
          bottom,
          b[1],
          b[0],
          bottom + height,
          b[1],
          a[0],
          bottom + height,
          a[1],
        );
        indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
      if (bottom > 0) {
        const underside = positions.length / 3;
        appendRoom(polygon, positions, indices);
        for (let i = underside * 3 + 1; i < positions.length; i += 3) {
          positions[i] = bottom;
        }
      }
    };
    authoring.obstacles.forEach((polygon) => solid(polygon));
    for (const zone of authoring.zones ?? []) {
      if (zone.type === 'blocked') {
        solid(zone.polygon);
      }
    }
    for (const wall of authoring.walls ?? []) {
      for (const box of authoredWallBoxes(wall)) {
        // Preserve height: a doorway lintel provides a ceiling, not a ground obstacle.
        solid(boxFootprint(box), box.position[1] - box.halfExtents[1], box.halfExtents[1] * 2);
      }
    }
    for (const room of layout.rooms.filter(
      (item) =>
        item.floorId === floorId && item.type === 'booth' && !managedBooths.has(item.id),
    )) {
      for (const box of boothPhysical(room).boxes) {
        solid(boxFootprint(box));
      }
    }
    for (const item of authoring.instances.filter((candidate) => candidate.collidable)) {
      for (const box of authoredInstancePhysical(item).boxes) {
        // Floor-top tiles are supporting surfaces, never above-ground route barriers.
        if (box.maxY <= 0.01) {
          continue;
        }
        // Rotated/sheared solids use their true projected corners and vertical extent.
        solid(box.footprint, Math.max(0, box.minY), box.maxY - Math.max(0, box.minY));
      }
    }
  }
  for (const room of layout.rooms) {
    if (!authoring && room.floorId === floorId && room.type !== 'service') {
      appendRoom(room.polygon, positions, indices);
    }
  }
  if (indices.length === 0) {
    return null;
  }
  await ensureInitialized();
  const generate = paints.length
    ? (
        vertices: number[],
        triangles: number[],
        config?: Parameters<typeof generateSoloNavMesh>[2],
      ) => {
        const navMesh = generateAreaNavMesh(vertices, triangles, paints, config);
        return { success: !!navMesh, navMesh };
      }
    : generateSoloNavMesh;
  const generated = generate(
    positions,
    indices,
    authoring
      ? {
          // New wall openings use a 0.4 m agent radius, matching Rapier's
          // 0.4 m collider half-width. Keep the existing legacy grid unchanged.
          cs:
            wayfinding ||
            authoring.walls?.length ||
            authoring.instances.some((candidate) => candidate.collidable)
              ? 0.2
              : 0.3,
          ch: 0.1,
          walkableHeight: 18,
          walkableRadius: 2,
          // The character has no autostep: sill solids must remain barriers to both systems.
          walkableClimb:
            authoring.walls?.length || authoring.instances.some((candidate) => candidate.collidable)
              ? 0
              : 2,
          maxSimplificationError: 1,
        }
      : undefined,
  );
  if (!generated.success || !generated.navMesh) {
    return null;
  }
  const query = new NavMeshQuery(generated.navMesh);
  if (cached) {
    cached.query.destroy();
    cached.mesh.destroy();
  }
  floorMeshes.set(floorId, { signature, areaSignature, query, mesh: generated.navMesh });

  return query;
}

export interface FloorRouteOptions {
  filter?: AreaQueryFilter;
  straight?: boolean;
  areas?: AreaPaint[];
}

async function floorHandles(
  layout: NormalizedLayout,
  floorId: string,
  paints: AreaPaint[] = [],
  wayfinding = false,
) {
  const query = await floorQuery(layout, floorId, paints, wayfinding);
  if (!query) {
    return null;
  }
  const cached = floorMeshes.get(floorId);
  if (!cached) {
    return null;
  }
  return { mesh: cached.mesh, query };
}

/**
 * Route across one floor's room surfaces. The portal graph in pathfinding.ts
 * remains the authority for cross-floor travel.
 */
export async function queryFloorRoute(
  layout: NormalizedLayout,
  floorId: string,
  from: RoutePoint,
  to: RoutePoint,
  options: FloorRouteOptions = {},
): Promise<RouteResult> {
  const handles = await floorHandles(layout, floorId, options.areas, !!options.filter);
  if (!handles) {
    return { ok: false, reason: 'NO_MESH' };
  }
  const { query } = handles;
  const filter = buildQueryFilter(options.filter);
  try {
    const start = query.findNearestPoly(
      { x: from[0], y: 0, z: from[2] },
      { halfExtents: PROJECTION_EXTENTS, ...(filter ? { filter } : {}) },
    );
    const end = query.findNearestPoly(
      { x: to[0], y: 0, z: to[2] },
      { halfExtents: PROJECTION_EXTENTS, ...(filter ? { filter } : {}) },
    );
    if (!start.success || !end.success) {
      return { ok: false, reason: 'OUTSIDE_MESH' };
    }
    if (start.nearestPoint.y > 0.3 || end.nearestPoint.y > 0.3) {
      return { ok: false, reason: 'OUTSIDE_MESH' };
    }
    // Endpoints on room boundaries project nearby instead of directly overhead.
    // Projections farther than the search extents mean the point is off-mesh.
    const startPoint = start.nearestPoint;
    const endPoint = end.nearestPoint;
    const maxSnap = Math.hypot(PROJECTION_EXTENTS.x, PROJECTION_EXTENTS.y, PROJECTION_EXTENTS.z);
    if (
      Math.hypot(startPoint.x - from[0], startPoint.z - from[2]) > maxSnap ||
      Math.hypot(endPoint.x - to[0], endPoint.z - to[2]) > maxSnap
    ) {
      return { ok: false, reason: 'OUTSIDE_MESH' };
    }
    const path = query.computePath(startPoint, endPoint, ...(filter ? [{ filter }] : []));
    const last = path.path.at(-1);
    const reached = last !== undefined && Math.hypot(last.x - to[0], last.z - to[2]) <= 1;
    if (!path.success || path.path.length === 0 || !reached) {
      return { ok: false, reason: 'NO_PATH' };
    }
    const heightOffset = layout.floors.find((f) => f.id === floorId)?.heightOffset ?? 0;
    const points = path.path.map((point): RoutePoint => [point.x, heightOffset + 1.2, point.z]);
    let straight: RoutePoint[] | undefined;
    if (options.straight) {
      const corridor = query.findPath(
        start.nearestRef,
        end.nearestRef,
        startPoint,
        endPoint,
        ...(filter ? [{ filter }] : []),
      );
      try {
        if (corridor.success) {
          const funnel = query.findStraightPath(startPoint, endPoint, corridor.polys, {
            maxStraightPathPoints: 512,
          });
          try {
            if (funnel.success && funnel.straightPathCount > 0) {
              straight = [];
              for (let i = 0; i < funnel.straightPathCount; i++) {
                straight.push([
                  funnel.straightPath.get(i * 3),
                  heightOffset + 1.2,
                  funnel.straightPath.get(i * 3 + 2),
                ]);
              }
            }
          } finally {
            funnel.straightPath.destroy();
            funnel.straightPathFlags.destroy();
            funnel.straightPathRefs.destroy();
          }
        }
      } finally {
        corridor.polys.destroy();
      }
    }
    return { ok: true, points, ...(straight ? { straight } : {}) };
  } finally {
    if (filter) {
      Raw.destroy(filter.raw);
    }
  }
}

/** Dijkstra over reachable portal entries; every horizontal edge uses the obstacle-aware mesh. */
export async function queryBuildingRoute(
  layout: NormalizedLayout,
  fromFloor: string,
  from: RoutePoint,
  toFloor: string,
  to: RoutePoint,
  options: {
    enabledPortalTypes?: readonly PortalType[];
    disabledPortals?: readonly string[];
    queryFilter?: AreaQueryFilter;
    straight?: boolean;
    navAreas?: Record<string, AreaPaint[]>;
  } = {},
): Promise<{
  points: RoutePoint[];
  floors: string[];
  straight?: RoutePoint[];
  buildMs?: number;
} | null> {
  const started = performance.now();
  const nodes = [
    { floor: fromFloor, point: from, portal: '' },
    { floor: toFloor, point: to, portal: '' },
    ...layout.portals
      .filter(
        (portal) => !options.enabledPortalTypes || options.enabledPortalTypes.includes(portal.type),
      )
      .filter((portal) => !options.disabledPortals?.includes(portal.id))
      .flatMap((p) =>
        (p.entries ?? []).map((entry) => ({
          floor: entry.floorId,
          point: [
            entry.position[0],
            (layout.floors.find((f) => f.id === entry.floorId)?.heightOffset ?? 0) + 1.2,
            entry.position[1],
          ] as RoutePoint,
          portal: p.id,
        })),
      ),
  ];
  const distances = nodes.map(() => Infinity),
    visited = new Set<number>();
  const previous = new Map<
    number,
    { node: number; points: RoutePoint[]; floors: string[]; straight?: RoutePoint[] }
  >();
  const legOptions = {
    ...(options.queryFilter ? { filter: options.queryFilter } : {}),
    ...(options.straight ? { straight: true } : {}),
  };
  const legAreas = (floorId: string) =>
    options.navAreas?.[floorId]?.length ? { areas: options.navAreas[floorId] } : {};
  distances[0] = 0;
  for (let count = 0; count < nodes.length; count++) {
    let u = -1;
    nodes.forEach((_, i) => {
      if (!visited.has(i) && (u < 0 || distances[i]! < distances[u]!)) {
        u = i;
      }
    });
    if (u < 0 || distances[u] === Infinity) {
      break;
    }
    if (u === 1) {
      break;
    }
    visited.add(u);
    const a = nodes[u]!;
    for (let v = 0; v < nodes.length; v++) {
      if (visited.has(v) || v === u) {
        continue;
      }
      const b = nodes[v]!;
      let points: RoutePoint[], floors: string[];
      let straight: RoutePoint[] | undefined;
      if (a.floor === b.floor) {
        const route = await queryFloorRoute(layout, a.floor, a.point, b.point, {
          ...legOptions,
          ...legAreas(a.floor),
        });
        if (!route.ok) {
          continue;
        }
        ({ points, straight } = route);
        floors = points.map(() => a.floor);
      } else if (a.portal && a.portal === b.portal) {
        points = [a.point, b.point];
        floors = [a.floor, b.floor];
      } else {
        continue;
      }
      const cost = points
        .slice(1)
        .reduce(
          (sum, p, i) =>
            sum + Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1], p[2] - points[i]![2]),
          0,
        );
      if (distances[u]! + cost < distances[v]!) {
        distances[v] = distances[u]! + cost;
        previous.set(v, { node: u, points, floors, ...(straight ? { straight } : {}) });
      }
    }
  }
  if (!previous.has(1)) {
    return null;
  }
  const legs: Array<{ points: RoutePoint[]; floors: string[]; straight?: RoutePoint[] }> = [];
  let cursor = 1;
  while (cursor !== 0) {
    const edge = previous.get(cursor)!;
    legs.unshift(edge);
    cursor = edge.node;
  }
  const buildMs = performance.now() - started;
  const straight = options.straight ? legs.flatMap((leg) => leg.straight ?? leg.points) : undefined;
  const rawPoints = legs.flatMap((leg) => leg.points);
  const rawFloors = legs.flatMap((leg) => leg.floors);
  // Preserve the owning leg. Nearest XZ is ambiguous for stacked floors/landings.
  const straightFloors = straight
    ? legs.flatMap((leg) => (leg.straight ? leg.straight.map(() => leg.floors[0]!) : leg.floors))
    : undefined;
  return {
    points: rawPoints,
    floors: rawFloors,
    ...(straight ? { straight, straightFloors } : {}),
    buildMs,
  };
}
