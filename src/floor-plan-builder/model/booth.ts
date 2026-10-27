import {
  pointInPolygon,
  polygonBounds,
  polygonEdges,
  signedArea,
  transformFootprint,
  segmentDistance,
  segmentsIntersect,
} from '@/utils/geometry/polygon.ts';
import { DEFAULT_BOOTH_DESIGN } from './booth-schema.ts';
import type { BoothDesign } from './booth-schema.ts';
import { isBooth, type PlanObject } from './types.ts';

export type BoothPoint = [number, number];
export interface BoothEdge {
  index: number;
  a: BoothPoint;
  b: BoothPoint;
  length: number;
  tangent: BoothPoint;
  inward: BoothPoint;
  mode: 'wall' | 'open' | 'entrance';
  opening: number;
}
export const boothDesign = (object: Pick<PlanObject, 'boothDesign'>): BoothDesign =>
  object.boothDesign ?? DEFAULT_BOOTH_DESIGN;

export function boothEdges(
  object: Pick<PlanObject, 'boothDesign' | 'polygon' | 'gate'>,
): BoothEdge[] {
  const design = boothDesign(object),
    { polygon } = object;
  const extreme = (side: PlanObject['gate']) =>
    polygon.reduce(
      (best, a, i) => {
        const b = polygon[(i + 1) % polygon.length]!;
        const score =
          side === 'front'
            ? a[1] + b[1]
            : side === 'back'
              ? -a[1] - b[1]
              : side === 'right'
                ? a[0] + b[0]
                : -a[0] - b[0];
        return score > best.score ? { i, score } : best;
      },
      { i: 0, score: -Infinity },
    ).i;
  const front = extreme(object.gate);
  const sides: Record<PlanObject['gate'], PlanObject['gate'][]> = {
    front: ['right', 'left'],
    right: ['back', 'front'],
    back: ['left', 'right'],
    left: ['front', 'back'],
  };
  const open = new Set([front]);
  if (design.layout === 'corner' || design.layout === 'peninsula') {
    open.add(extreme(sides[object.gate][0]!));
  }
  if (design.layout === 'peninsula') {
    open.add(extreme(sides[object.gate][1]!));
  }
  const orientation = Math.sign(signedArea(polygon)) || 1;
  return polygonEdges(polygon).map(([a, b], index) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const tangent: BoothPoint = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const override = design.edges.find((edge) => edge.edge === index);
    const mode =
      override?.mode ??
      (design.layout === 'enclosed'
        ? index === front
          ? 'entrance'
          : 'wall'
        : design.layout === 'island' || open.has(index)
          ? 'open'
          : 'wall');
    return {
      index,
      a: [...a] as BoothPoint,
      b: [...b] as BoothPoint,
      length,
      tangent,
      inward: [-tangent[1] * orientation, tangent[0] * orientation] as BoothPoint,
      mode,
      opening: mode === 'open' ? length : mode === 'entrance' ? (override?.width ?? 1.2) : 0,
    };
  });
}
export function wallRuns(edge: BoothEdge): [number, number][] {
  if (edge.mode === 'open') {
    return [];
  }
  if (edge.mode === 'wall') {
    return [[0, edge.length]];
  }
  const side = Math.max(0, (edge.length - edge.opening) / 2);
  return [
    [0, side],
    [edge.length - side, edge.length],
  ];
}
export function edgePoint(edge: BoothEdge, distance: number, inset = 0): BoothPoint {
  return [
    edge.a[0] + edge.tangent[0] * distance + edge.inward[0] * inset,
    edge.a[1] + edge.tangent[1] * distance + edge.inward[1] * inset,
  ];
}
/** Exact inward-line intersection, bounded at sharp corners to avoid unbounded miter spikes. */
export function cornerInset(edges: BoothEdge[], index: number, thickness: number): BoothPoint {
  const edge = edges[index]!,
    previous = edges[(index + edges.length - 1) % edges.length]!;
  const x = previous.inward[0] + edge.inward[0],
    z = previous.inward[1] + edge.inward[1];
  const denominator = 1 + previous.inward[0] * edge.inward[0] + previous.inward[1] * edge.inward[1];
  let dx = (x * thickness) / Math.max(denominator, 1e-6),
    dz = (z * thickness) / Math.max(denominator, 1e-6);
  const length = Math.hypot(dx, dz),
    limit = thickness * 2;
  if (length > limit) {
    dx *= limit / length;
    dz *= limit / length;
  }
  return [edge.a[0] + dx, edge.a[1] + dz];
}
export function wallPolygon(
  edges: BoothEdge[],
  edge: BoothEdge,
  from: number,
  to: number,
  thickness = 0.08,
): BoothPoint[] {
  return [
    edgePoint(edge, from),
    edgePoint(edge, to),
    to >= edge.length - 1e-6
      ? cornerInset(edges, (edge.index + 1) % edges.length, thickness)
      : edgePoint(edge, to, thickness),
    from <= 1e-6 ? cornerInset(edges, edge.index, thickness) : edgePoint(edge, from, thickness),
  ];
}
export function boothWorldPoints(object: PlanObject, points: BoothPoint[]): BoothPoint[] {
  const [a, b, c, d] = object.planarMatrix ?? [1, 0, 0, 1];
  return transformFootprint(
    points.map(([x, z]) => [(a * x + c * z) * object.scale[0], (b * x + d * z) * object.scale[2]]),
    object.position,
    object.yawRadians,
  );
}
export function cornerPostPolygon(edges: BoothEdge[], index: number): BoothPoint[] {
  const edge = edges[index]!,
    previous = edges[(index + edges.length - 1) % edges.length]!;
  return [
    edge.a,
    edgePoint(edge, 0, 0.05),
    cornerInset(edges, index, 0.05),
    edgePoint(previous, previous.length, 0.05),
  ];
}
/** Stretch the footprint/height while keeping construction profiles in physical meters. */
export function bakeBooth(object: PlanObject): PlanObject {
  const [a, b, c, d] = object.planarMatrix ?? [1, 0, 0, 1];
  const polygon = object.polygon.map(([x, z]): BoothPoint => [
    (a * x + c * z) * object.scale[0],
    (b * x + d * z) * object.scale[2],
  ]);
  const bounds = polygonBounds(polygon);
  return {
    ...object,
    polygon,
    planarMatrix: undefined,
    scale: [1, 1, 1],
    dimensions: [
      bounds.maxX - bounds.minX,
      object.dimensions[1] * object.scale[1],
      bounds.maxZ - bounds.minZ,
    ],
  };
}
export function closetFootprint(object: PlanObject): BoothPoint[] {
  const b = polygonBounds(object.polygon),
    x = b.minX + 0.09,
    z = b.minZ + 0.09;
  return [
    [x, z],
    [x + 1.7, z],
    [x + 1.7, z + 1.1],
    [x, z + 1.1],
  ];
}
export function boothNavigationPolygons(object: PlanObject): BoothPoint[][] {
  object = bakeBooth(object);
  const edges = boothEdges(object);
  const polygons = edges.flatMap((edge) =>
    wallRuns(edge).map(([a, b]) => wallPolygon(edges, edge, a, b)),
  );
  // Open layouts still have load-bearing columns, including island corners.
  for (const edge of edges) {
    const cap = cornerPostPolygon(edges, edge.index);
    if (Math.abs(signedArea(cap)) > 1e-7) {
      polygons.push(cap);
    }
  }
  if (boothDesign(object).storage) {
    polygons.push(closetFootprint(object));
  }
  if (boothDesign(object).roof === 'solid' && object.dimensions[1] * object.scale[1] < 1.85) {
    polygons.push(object.polygon);
  }
  return polygons.map((polygon) => boothWorldPoints(object, polygon));
}
export function boothDesignError(object: PlanObject): string | null {
  if (!isBooth(object) || !object.boothDesign) {
    return null;
  }
  const physical = bakeBooth(object);
  const design = object.boothDesign,
    edges = boothEdges(physical);
  const [w, h, d] = physical.dimensions;
  if (object.recipe === 'booth' && (w < 2 || w > 12 || d < 2 || d > 12 || h < 2.2 || h > 4.5)) {
    return 'Shell-scheme booths require width/depth 2–12 m and height 2.2–4.5 m.';
  }
  if (object.recipe === 'polygon-booth') {
    if (h < 2.2 || h > 6 || object.polygon.length > 32) {
      return 'Polygon booths require height 2.2–6 m and at most 32 vertices.';
    }
    for (const edge of edges) {
      if (edge.length < 0.8) {
        return `Edge ${edge.index + 1} must be at least 0.8 m.`;
      }
      const previous = edges[(edge.index + edges.length - 1) % edges.length]!;
      const cosine = -(
        previous.tangent[0] * edge.tangent[0] +
        previous.tangent[1] * edge.tangent[1]
      );
      const angle = (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
      const turn = previous.tangent[0] * edge.tangent[1] - previous.tangent[1] * edge.tangent[0];
      if (turn * Math.sign(signedArea(physical.polygon)) > 0 && angle < 45) {
        return `Vertex ${edge.index + 1} has an angle below 45°. Broaden this corner.`;
      }
    }
  }
  if (new Set(design.edges.map((edge) => edge.edge)).size !== design.edges.length) {
    return 'Configure each edge only once.';
  }
  if (design.edges.some((edge) => edge.edge >= object.polygon.length)) {
    return 'An edge configuration refers to a removed vertex. Reset its edge settings.';
  }
  for (const edge of edges) {
    if (edge.mode === 'entrance' && edge.length < edge.opening + 0.6 - 1e-7) {
      return `Edge ${edge.index + 1} needs ${(edge.opening + 0.6).toFixed(1)} m for its door plus two 0.3 m corner margins. Use Full open for shorter edges.`;
    }
  }
  if (!edges.some((edge) => edge.mode !== 'wall')) {
    return 'Keep at least one booth edge open or add an entrance.';
  }
  if (design.storage) {
    const closet = closetFootprint(physical);
    const samples = [
      ...closet,
      ...polygonEdges(closet).map(([a, b]): BoothPoint => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]),
    ];
    if (
      !samples.every((point) => pointInPolygon(point, physical.polygon)) ||
      polygonEdges(closet).some(([a, b]) =>
        polygonEdges(physical.polygon).some(([start, end]) => segmentsIntersect(a, b, start, end)),
      )
    ) {
      return 'The rear-left 1.7 × 1.1 m storage closet does not fit inside this polygon.';
    }
  }
  return null;
}
export function snapBoothPosition(
  object: PlanObject,
  objects: PlanObject[],
  position: BoothPoint,
): BoothPoint {
  if (!isBooth(object) || !object.boothDesign?.snap) {
    return position;
  }
  const candidate = { ...object, position },
    points = boothWorldPoints(candidate, candidate.polygon);
  let delta: BoothPoint = [0, 0],
    nearest = 0.18;
  for (const point of points) {
    const dx = Math.round(point[0] / 0.5) * 0.5 - point[0],
      dz = Math.round(point[1] / 0.5) * 0.5 - point[1];
    const distance = Math.hypot(dx, dz);
    if (distance < nearest) {
      nearest = distance;
      delta = [dx, dz];
    }
  }
  for (const other of objects.filter(
    (item) => item.id !== object.id && isBooth(item) && item.boothDesign?.snap,
  )) {
    for (const edge of boothEdges(candidate).filter((item) => item.mode === 'wall')) {
      const [a, b] = boothWorldPoints(candidate, [edge.a, edge.b]) as [BoothPoint, BoothPoint];
      for (const target of boothEdges(other).filter((item) => item.mode === 'wall')) {
        const [c, d] = boothWorldPoints(other, [target.a, target.b]) as [BoothPoint, BoothPoint];
        const dx = c[0] - b[0],
          dz = c[1] - b[1],
          distance = Math.hypot(dx, dz);
        if (distance < 0.18 && Math.hypot(a[0] + dx - d[0], a[1] + dz - d[1]) < 0.01) {
          delta = [dx, dz];
          nearest = 0;
        }
      }
    }
  }
  return [position[0] + delta[0], position[1] + delta[1]];
}
export function polygonGap(a: BoothPoint[], b: BoothPoint[]): number {
  return Math.min(
    ...a.map((point) => Math.min(...polygonEdges(b).map(([c, d]) => segmentDistance(point, c, d)))),
    ...b.map((point) => Math.min(...polygonEdges(a).map(([c, d]) => segmentDistance(point, c, d)))),
  );
}
/** Intentional shared closed walls may snap flush; open edges retain the requested aisle buffer. */
export function sharesBoothWall(a: PlanObject, b: PlanObject): boolean {
  if (!isBooth(a) || !isBooth(b) || !a.boothDesign?.snap || !b.boothDesign?.snap) {
    return false;
  }
  return boothEdges(a)
    .filter((edge) => edge.mode === 'wall')
    .some((first) => {
      const [p, q] = boothWorldPoints(a, [first.a, first.b]);
      return boothEdges(b)
        .filter((edge) => edge.mode === 'wall')
        .some((second) => {
          const [r, s] = boothWorldPoints(b, [second.a, second.b]);
          return (
            (Math.hypot(p![0] - s![0], p![1] - s![1]) < 1e-5 &&
              Math.hypot(q![0] - r![0], q![1] - r![1]) < 1e-5) ||
            (Math.hypot(p![0] - r![0], p![1] - r![1]) < 1e-5 &&
              Math.hypot(q![0] - s![0], q![1] - s![1]) < 1e-5)
          );
        });
    });
}
