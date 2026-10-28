export type ScreenPoint = readonly [number, number];
export type ProjectWorldPoint = (point: readonly [number, number]) => ScreenPoint | null;

export const POLYGON_CLOSE_RADIUS_PX = 16;
export const FOOTPRINT_HANDLE_RADIUS_PX = 18;

export function isPrimaryCanvasClick(button: number, movementPx: number, thresholdPx = 3): boolean {
  return button === 0 && Number.isFinite(movementPx) && movementPx <= thresholdPx;
}

function distanceToSegment(point: ScreenPoint, start: ScreenPoint, end: ScreenPoint): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(
        0,
        Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared),
      )
    : 0;
  return Math.hypot(point[0] - start[0] - t * dx, point[1] - start[1] - t * dy);
}

export function isWithinScreenRadius(
  point: ScreenPoint,
  target: ScreenPoint,
  radiusPx: number,
): boolean {
  return Math.hypot(point[0] - target[0], point[1] - target[1]) <= radiusPx;
}

export function nearestPolygonVertex(
  polygon: readonly (readonly [number, number])[],
  pointer: ScreenPoint,
  project: ProjectWorldPoint,
  radiusPx = FOOTPRINT_HANDLE_RADIUS_PX,
): number | null {
  let nearestIndex: number | null = null;
  let nearestDistance = radiusPx;
  polygon.forEach((point, index) => {
    const screen = project(point);
    if (!screen) {
      return;
    }
    const distance = Math.hypot(pointer[0] - screen[0], pointer[1] - screen[1]);
    if (distance <= nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

export function nearestPolygonEdge(
  polygon: readonly (readonly [number, number])[],
  pointer: ScreenPoint,
  project: ProjectWorldPoint,
  radiusPx = FOOTPRINT_HANDLE_RADIUS_PX,
): { edgeIndex: number; distancePx: number } | null {
  let nearest: { edgeIndex: number; distancePx: number } | null = null;
  for (let edgeIndex = 0; edgeIndex < polygon.length; edgeIndex++) {
    const start = polygon[edgeIndex];
    const end = polygon[(edgeIndex + 1) % polygon.length];
    if (!start || !end) {
      continue;
    }
    const screenStart = project(start);
    const screenEnd = project(end);
    if (!screenStart || !screenEnd) {
      continue;
    }
    const distancePx = distanceToSegment(pointer, screenStart, screenEnd);
    if (distancePx <= radiusPx && (!nearest || distancePx < nearest.distancePx)) {
      nearest = { edgeIndex, distancePx };
    }
  }
  return nearest;
}

export function movePolygonVertex(
  polygon: readonly (readonly [number, number])[],
  index: number,
  point: readonly [number, number],
): [number, number][] | null {
  if (index < 0 || index >= polygon.length || !point.every(Number.isFinite)) {
    return null;
  }
  return polygon.map((vertex, vertexIndex) =>
    vertexIndex === index ? [point[0], point[1]] : [vertex[0], vertex[1]],
  );
}

export function insertPolygonVertex(
  polygon: readonly (readonly [number, number])[],
  edgeIndex: number,
  point: readonly [number, number],
): [number, number][] | null {
  if (
    polygon.length >= 256 ||
    edgeIndex < 0 ||
    edgeIndex >= polygon.length ||
    !point.every(Number.isFinite)
  ) {
    return null;
  }
  const result = polygon.map(([x, z]) => [x, z] as [number, number]);
  result.splice(edgeIndex + 1, 0, [point[0], point[1]]);
  return result;
}

export function removePolygonVertex(
  polygon: readonly (readonly [number, number])[],
  index: number,
): [number, number][] | null {
  if (polygon.length <= 3 || index < 0 || index >= polygon.length) {
    return null;
  }
  return polygon.filter((_, vertexIndex) => vertexIndex !== index).map(([x, z]) => [x, z]);
}
