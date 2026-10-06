import { init, NavMeshQuery } from '@recast-navigation/core';
import { generateSoloNavMesh } from '@recast-navigation/generators';
import { ShapeUtils, Vector2 } from 'three';
import type { NormalizedLayout } from './normalize-layout.ts';

export type RoutePoint = [number, number, number];

export type RouteResult =
  | { ok: true; points: RoutePoint[] }
  | { ok: false; reason: 'NO_MESH' | 'NO_PATH' | 'OUTSIDE_MESH' };

/** Recast agent radius that still fits the 4 m booth grid. */
const PROJECTION_EXTENTS = { x: 2, y: 4, z: 2 };

let initPromise: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  initPromise ??= init();
  return initPromise;
}

interface CachedFloorMesh {
  layout: NormalizedLayout;
  query: NavMeshQuery;
}

const floorMeshes = new Map<string, CachedFloorMesh>();

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

async function floorQuery(layout: NormalizedLayout, floorId: string): Promise<NavMeshQuery | null> {
  const cached = floorMeshes.get(floorId);
  if (cached && cached.layout === layout) {
    return cached.query;
  }
  const positions: number[] = [];
  const indices: number[] = [];
  for (const room of layout.rooms) {
    if (room.floorId === floorId) {
      appendRoom(room.polygon, positions, indices);
    }
  }
  if (indices.length === 0) {
    return null;
  }
  await ensureInitialized();
  const generated = generateSoloNavMesh(positions, indices);
  if (!generated.success || !generated.navMesh) {
    return null;
  }
  const query = new NavMeshQuery(generated.navMesh);
  floorMeshes.set(floorId, { layout, query });
  return query;
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
): Promise<RouteResult> {
  const query = await floorQuery(layout, floorId);
  if (!query) {
    return { ok: false, reason: 'NO_MESH' };
  }
  const start = query.findNearestPoly(
    { x: from[0], y: from[1], z: from[2] },
    { halfExtents: PROJECTION_EXTENTS },
  );
  const end = query.findNearestPoly(
    { x: to[0], y: to[1], z: to[2] },
    { halfExtents: PROJECTION_EXTENTS },
  );
  if (!start.success || !end.success) {
    return { ok: false, reason: 'OUTSIDE_MESH' };
  }
  // Endpoints on room boundaries project nearby instead of directly overhead.
  // Projections farther than the search extents mean the point is off-mesh.
  const startPoint = start.isOverPoly ? { x: from[0], y: from[1], z: from[2] } : start.nearestPoint;
  const endPoint = end.isOverPoly ? { x: to[0], y: to[1], z: to[2] } : end.nearestPoint;
  const maxSnap = Math.hypot(PROJECTION_EXTENTS.x, PROJECTION_EXTENTS.y, PROJECTION_EXTENTS.z);
  if (
    Math.hypot(startPoint.x - from[0], startPoint.y - from[1], startPoint.z - from[2]) > maxSnap ||
    Math.hypot(endPoint.x - to[0], endPoint.y - to[1], endPoint.z - to[2]) > maxSnap
  ) {
    return { ok: false, reason: 'OUTSIDE_MESH' };
  }
  const path = query.computePath(startPoint, endPoint);
  const last = path.path.at(-1);
  const reached = last !== undefined && Math.hypot(last.x - to[0], last.z - to[2]) <= 1;
  if (!path.success || path.path.length === 0 || !reached) {
    return { ok: false, reason: 'NO_PATH' };
  }
  return {
    ok: true,
    points: path.path.map((point): RoutePoint => [point.x, point.y, point.z]),
  };
}
