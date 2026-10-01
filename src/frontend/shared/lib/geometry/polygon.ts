export type Point2 = readonly [number, number];
const EPSILON = 1e-8;

export function signedArea(points: readonly Point2[]): number {
  return (
    points.reduce((sum, p, i) => {
      const next = points[(i + 1) % points.length];
      return next ? sum + p[0] * next[1] - next[0] * p[1] : sum;
    }, 0) / 2
  );
}

function cross(a: Point2, b: Point2, c: Point2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

export function segmentDistance(p: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSquared = dx * dx + dz * dz;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSquared));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

export function segmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (
    ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
    ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))
  ) {
    return true;
  }
  return (
    segmentDistance(c, a, b) < EPSILON ||
    segmentDistance(d, a, b) < EPSILON ||
    segmentDistance(a, c, d) < EPSILON ||
    segmentDistance(b, c, d) < EPSILON
  );
}

export function polygonEdges(points: readonly Point2[]): Array<[Point2, Point2]> {
  return points.flatMap((p, i) => {
    const next = points[(i + 1) % points.length];
    return next ? [[p, next] as [Point2, Point2]] : [];
  });
}

export function isSimplePolygon(points: readonly Point2[]): boolean {
  if (
    points.length < 3 ||
    points.some((p) => !p.every(Number.isFinite)) ||
    Math.abs(signedArea(points)) < EPSILON
  ) {
    return false;
  }
  const edges = polygonEdges(points);
  for (const [i, [a, b]] of edges.entries()) {
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < EPSILON) {
      return false;
    }
    for (let j = i + 1; j < edges.length; j++) {
      const other = edges[j];
      if (!other || j === i + 1 || (i === 0 && j === edges.length - 1)) {
        continue;
      }
      if (segmentsIntersect(a, b, other[0], other[1])) {
        return false;
      }
    }
  }
  return true;
}

export function pointInPolygon(point: Point2, polygon: readonly Point2[]): boolean {
  let inside = false;
  for (const [a, b] of polygonEdges(polygon)) {
    if (segmentDistance(point, a, b) < EPSILON) {
      return true;
    }
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function boundaryDistance(point: Point2, polygon: readonly Point2[]): number {
  return Math.min(...polygonEdges(polygon).map(([a, b]) => segmentDistance(point, a, b)));
}

export function polygonContains(
  outer: readonly Point2[],
  inner: readonly Point2[],
  clearance = 0,
): boolean {
  if (
    !inner.every(
      (p) => pointInPolygon(p, outer) && boundaryDistance(p, outer) + EPSILON >= clearance,
    )
  ) {
    return false;
  }
  for (const [a, b] of polygonEdges(inner)) {
    for (const [c, d] of polygonEdges(outer)) {
      if (segmentsIntersect(a, b, c, d)) {
        return false;
      }
      if (
        Math.min(
          segmentDistance(c, a, b),
          segmentDistance(d, a, b),
          segmentDistance(a, c, d),
          segmentDistance(b, c, d),
        ) +
          EPSILON <
        clearance
      ) {
        return false;
      }
    }
  }
  return true;
}

export function polygonsOverlap(a: readonly Point2[], b: readonly Point2[]): boolean {
  return (
    a.some((p) => pointInPolygon(p, b)) ||
    b.some((p) => pointInPolygon(p, a)) ||
    polygonEdges(a).some(([p, q]) =>
      polygonEdges(b).some(([r, s]) => segmentsIntersect(p, q, r, s)),
    )
  );
}

export function polygonBounds(polygon: readonly Point2[]) {
  const xs = polygon.map((p) => p[0]);
  const zs = polygon.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

export function transformFootprint(
  polygon: readonly Point2[],
  position: Point2,
  yaw: number,
): Array<[number, number]> {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return polygon.map(([x, z]) => [
    position[0] + x * cosine + z * sine,
    position[1] - x * sine + z * cosine,
  ]);
}
