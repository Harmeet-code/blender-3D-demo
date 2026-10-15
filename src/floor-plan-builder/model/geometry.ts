import {
  pointInPolygon,
  polygonEdges,
  polygonBounds,
  transformFootprint,
  segmentDistance,
  segmentsIntersect,
} from '@/utils/geometry/polygon.ts';
import { polygonSchema, type PlanFloor, type PlanObject } from './types.ts';
import { referencePoint, referenceYaw } from './coordinates.ts';
import { wallSpans, wallHeightFor } from '@/features/building/model/wall-spans.ts';
import { authoredWallBoxes } from '@/features/building/model/authored-walls.ts';
import { boxFootprint } from '@/features/building/model/booth-physical.ts';
import { inventory } from './inventory.ts';
import { ShapeUtils, Vector2 } from 'three';
import { boothDesignError, polygonGap, sharesBoothWall } from './booth.ts';
import { tentDesignError } from './tent.ts';
import { entranceDesignError } from './entrance.ts';
import { washroomDesignError } from './washroom.ts';
import { kidsDesignError } from './kids.ts';
import { avatarDesignError } from './avatar.ts';
import { infoDesignError } from './information.ts';
import { kioskDesignError, kioskQueueLocal } from './kiosk.ts';
import { waterDesignError } from './water.ts';
import { firstAidDesignError } from './firstaid.ts';
import { exitDesignError, exitClearLocal } from './exit.ts';
import {
  circulationApproaches,
  circulationError,
  circulationHeight,
  fitCirculation,
} from './circulation.ts';

export function staticBlockers(floor: PlanFloor, height = Infinity): [number, number][][] {
  const convert = (point: [number, number]) => referencePoint(floor, point);
  const rooms = (floor.referenceRooms ?? []).flatMap((room) => {
    const converted = {
      ...room,
      polygon: room.polygon.map(convert),
      entrance: room.entrance
        ? {
            position: convert(room.entrance.position),
            yawRadians: referenceYaw(floor, room.entrance.yawRadians),
          }
        : undefined,
    };
    const wallHeight = wallHeightFor(converted);
    if (wallHeight <= 0.01) {
      return [];
    }
    return wallSpans(converted).map(({ a, b }) =>
      boxFootprint({
        position: [(a[0] + b[0]) / 2, wallHeight / 2, (a[1] + b[1]) / 2],
        halfExtents: [Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, wallHeight / 2, 0.075],
        yaw: -Math.atan2(b[1] - a[1], b[0] - a[0]),
      }),
    );
  });
  return [
    ...rooms,
    ...(floor.source.authoring?.obstacles ?? []).map((polygon) => polygon.map(convert)),
    ...(floor.source.authoring?.walls ?? []).flatMap((wall) =>
      authoredWallBoxes({ ...wall, start: convert(wall.start), end: convert(wall.end) })
        .filter(
          (box) =>
            box.position[1] - box.halfExtents[1] < height &&
            box.position[1] + box.halfExtents[1] > 0.01,
        )
        .map(boxFootprint),
    ),
  ];
}

export function objectPoints(object: PlanObject, points: [number, number][]): [number, number][] {
  const [a, b, c, d] = object.planarMatrix ?? [1, 0, 0, 1];
  return transformFootprint(
    points.map(([x, z]) => [(a * x + c * z) * object.scale[0], (b * x + d * z) * object.scale[2]]),
    object.position,
    object.yawRadians,
  );
}
export function baseFootprint(object: PlanObject): [number, number][] {
  return objectPoints(object, object.polygon);
}
export function visualHeight(object: PlanObject): number {
  if (object.circulationDesign && !object.legacyPortalLanding) {
    return circulationHeight(object);
  }
  const rails =
    !object.legacyPortalLanding &&
    object.handrails &&
    ['stairs', 'escalator', 'ramp'].includes(object.recipe);
  return (object.dimensions[1] + (rails ? 0.93 : 0)) * object.scale[1];
}
export function gateEdge(polygon: [number, number][], gate: PlanObject['gate']): number {
  return polygon.reduce(
    (best, point, index) => {
      const next = polygon[(index + 1) % polygon.length]!;
      const score =
        gate === 'front'
          ? point[1] + next[1]
          : gate === 'back'
            ? -point[1] - next[1]
            : gate === 'left'
              ? -point[0] - next[0]
              : point[0] + next[0];
      return score > best.score ? { score, index } : best;
    },
    { score: -Infinity, index: 0 },
  ).index;
}
export function footprint(object: PlanObject): [number, number][] {
  const bounds = polygonBounds(object.polygon);
  const poles = object.recipe === 'barn-tent' ? object.polePositions : [];
  const polygon: [number, number][] =
    object.recipe === 'barn-tent'
      ? [
          [
            Math.min(bounds.minX - object.roofOverhang, ...poles.map(([x]) => x - 0.05)),
            Math.min(bounds.minZ - object.roofOverhang, ...poles.map(([, z]) => z - 0.05)),
          ],
          [
            Math.max(bounds.maxX + object.roofOverhang, ...poles.map(([x]) => x + 0.05)),
            Math.min(bounds.minZ - object.roofOverhang, ...poles.map(([, z]) => z - 0.05)),
          ],
          [
            Math.max(bounds.maxX + object.roofOverhang, ...poles.map(([x]) => x + 0.05)),
            Math.max(bounds.maxZ + object.roofOverhang, ...poles.map(([, z]) => z + 0.05)),
          ],
          [
            Math.min(bounds.minX - object.roofOverhang, ...poles.map(([x]) => x - 0.05)),
            Math.max(bounds.maxZ + object.roofOverhang, ...poles.map(([, z]) => z + 0.05)),
          ],
        ]
      : object.polygon;
  return objectPoints(object, polygon);
}
export function toLocal(
  points: [number, number][],
  position: [number, number],
  yaw = 0,
): [number, number][] {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  return points.map(([x, z]) => [
    (x - position[0]) * c - (z - position[1]) * s,
    (x - position[0]) * s + (z - position[1]) * c,
  ]);
}
/** Exact positive-area overlap. A shared boundary does not imply collision. */
export function overlaps(a: [number, number][], b: [number, number][]): boolean {
  const ab = polygonBounds(a),
    bb = polygonBounds(b);
  if (
    ab.maxX <= bb.minX + 1e-7 ||
    bb.maxX <= ab.minX + 1e-7 ||
    ab.maxZ <= bb.minZ + 1e-7 ||
    bb.maxZ <= ab.minZ + 1e-7
  ) {
    return false;
  }
  const triangles = (polygon: [number, number][]) =>
    ShapeUtils.triangulateShape(
      polygon.map(([x, z]) => new Vector2(x, z)),
      [],
    ).map((face) => face.map((index) => polygon[index]!));
  const otherTriangles = triangles(b);
  return triangles(a).some((first) =>
    otherTriangles.some((second) => {
      // Strict SAT on triangulated concave polygons handles coincident and arbitrarily thin
      // overlaps without offset probes. A zero projection overlap is edge contact, not collision.
      for (const polygon of [first, second]) {
        for (const [p, q] of polygonEdges(polygon)) {
          const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
          if (!length) {
            continue;
          }
          const x = -(q[1] - p[1]) / length,
            z = (q[0] - p[0]) / length;
          const left = first.map((point) => point[0] * x + point[1] * z),
            right = second.map((point) => point[0] * x + point[1] * z);
          if (
            Math.min(Math.max(...left), Math.max(...right)) -
              Math.max(Math.min(...left), Math.min(...right)) <=
            1e-8
          ) {
            return false;
          }
        }
      }
      return true;
    }),
  );
}
export function insideBoundary(points: [number, number][], boundary: [number, number][]): boolean {
  if (!points.every((p) => pointInPolygon(p, boundary))) {
    return false;
  }
  // Split each edge at every boundary crossing. Checking only its midpoint misses narrow notches.
  for (const [a, b] of polygonEdges(points)) {
    const rx = b[0] - a[0],
      rz = b[1] - a[1],
      lengthSquared = rx * rx + rz * rz,
      cuts = [0, 1];
    for (const [c, d] of polygonEdges(boundary)) {
      const sx = d[0] - c[0],
        sz = d[1] - c[1],
        denominator = rx * sz - rz * sx;
      if (Math.abs(denominator) > 1e-10) {
        const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / denominator;
        const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / denominator;
        if (t > 0 && t < 1 && u >= -1e-8 && u <= 1 + 1e-8) {
          cuts.push(t);
        }
      } else if (lengthSquared > 0) {
        for (const endpoint of [c, d]) {
          const t = ((endpoint[0] - a[0]) * rx + (endpoint[1] - a[1]) * rz) / lengthSquared;
          if (t > 0 && t < 1) {
            cuts.push(t);
          }
        }
      }
    }
    cuts.sort((x, y) => x - y);
    for (let i = 1; i < cuts.length; i++) {
      const t = (cuts[i - 1]! + cuts[i]!) / 2;
      if (!pointInPolygon([a[0] + rx * t, a[1] + rz * t], boundary)) {
        return false;
      }
    }
  }
  return true;
}
export function placementError(object: PlanObject, floor: PlanFloor): string | null {
  const designError =
    boothDesignError(object) ??
    circulationError(object) ??
    tentDesignError(object) ??
    entranceDesignError(object) ??
    washroomDesignError(object) ??
    kidsDesignError(object) ??
    avatarDesignError(object) ??
    infoDesignError(object) ??
    kioskDesignError(object) ??
    waterDesignError(object) ??
    firstAidDesignError(object) ??
    exitDesignError(object);
  if (designError) {
    return designError;
  }
  const definition = inventory.find((item) => item.id === object.recipe);
  if (
    object.managed &&
    definition &&
    object.dimensions.some(
      (value, axis) =>
        !Number.isFinite(value) ||
        value < definition.minDimensions[axis]! ||
        value > definition.maxDimensions[axis]!,
    )
  ) {
    return 'Use dimensions between 0.1 and 1000 meters for inventory objects.';
  }
  if (
    object.recipe === 'barn-tent' &&
    object.polePositions.some(
      ([x, z]) => Math.abs(x) > object.dimensions[0] / 2 || Math.abs(z) > object.dimensions[2] / 2,
    )
  ) {
    return 'Tent poles must lie within its base dimensions.';
  }
  const shape = footprint(object);
  if (!polygonSchema.safeParse(shape).success) {
    return 'Invalid shape: use unique vertices, positive area and no crossings.';
  }
  if (!insideBoundary(shape, floor.boundary)) {
    return 'Keep the whole object inside the floor boundary.';
  }
  if (object.recipe === 'food-kiosk') {
    const queue = objectPoints(object, kioskQueueLocal(object));
    if (!insideBoundary(queue, floor.boundary)) {
      return 'Keep the kiosk queue clear zone inside the floor boundary.';
    }
  }
  if (object.recipe === 'exit') {
    const clear = objectPoints(object, exitClearLocal(object));
    if (!insideBoundary(clear, floor.boundary)) {
      return 'Keep the exit approach clear zone inside the floor boundary.';
    }
  }
  if (
    object.collidable &&
    floor.zones.some((zone) => zone.type === 'blocked' && overlaps(shape, zone.polygon))
  ) {
    return 'This position intersects a blocked zone.';
  }
  if (object.collidable) {
    const approaches = circulationApproaches(object);
    const obstacles = [
      ...floor.zones.filter((zone) => zone.type === 'blocked').map((zone) => zone.polygon),
      ...staticBlockers(floor, visualHeight(object)),
      ...floor.objects.filter((other) => other.id !== object.id && other.collidable).map(footprint),
    ];
    if (
      approaches.some(
        (approach) =>
          !insideBoundary(approach, floor.boundary) ||
          obstacles.some((obstacle) => overlaps(approach, obstacle)),
      )
    ) {
      return 'Keep the 1.5 m connector approach clear and inside the floor boundary.';
    }
    const blockedEntry = floor.objects.find(
      (other) =>
        other.id !== object.id &&
        circulationApproaches(other).some((approach) => overlaps(shape, approach)),
    );
    if (blockedEntry) {
      return `Keep the landing approach to ${blockedEntry.name} clear.`;
    }
    if (staticBlockers(floor, visualHeight(object)).some((polygon) => overlaps(shape, polygon))) {
      return 'This position intersects an authored obstacle or wall.';
    }
    const collision = floor.objects.find(
      (other) => other.id !== object.id && other.collidable && overlaps(shape, footprint(other)),
    );
    if (collision) {
      return `Overlaps ${collision.name}. Move or resize the object.`;
    }
    const queueBlock = floor.objects.find(
      (other) =>
        other.id !== object.id &&
        other.recipe === 'food-kiosk' &&
        overlaps(shape, objectPoints(other, kioskQueueLocal(other))),
    );
    if (queueBlock) {
      return `Keep the ${queueBlock.name} queue clear zone unobstructed.`;
    }
    const exitBlock = floor.objects.find(
      (other) =>
        other.id !== object.id &&
        other.recipe === 'exit' &&
        overlaps(shape, objectPoints(other, exitClearLocal(other))),
    );
    if (exitBlock) {
      return `Keep the ${exitBlock.name} approach clear zone unobstructed.`;
    }
    const margin = object.boothDesign?.clearance ?? 0;
    if (margin && polygonGap(shape, floor.boundary) < margin - 1e-7) {
      return `Keep the requested ${margin.toFixed(2)} m booth clearance inside the floor boundary.`;
    }
    const blocked = [
      ...floor.zones.filter((zone) => zone.type === 'blocked').map((zone) => zone.polygon),
      ...staticBlockers(floor, visualHeight(object)),
    ];
    if (margin && blocked.some((polygon) => polygonGap(shape, polygon) < margin - 1e-7)) {
      return `Keep ${margin.toFixed(2)} m booth clearance from blocked geometry.`;
    }
    const close = floor.objects.find(
      (other) =>
        other.id !== object.id &&
        other.collidable &&
        !sharesBoothWall(object, other) &&
        polygonGap(shape, footprint(other)) < margin + (other.boothDesign?.clearance ?? 0) - 1e-7,
    );
    if (close) {
      return `Leave ${(margin + (close.boothDesign?.clearance ?? 0)).toFixed(2)} m combined clearance from ${close.name}, or snap two closed walls flush.`;
    }
  }
  return null;
}
/** Optional measured gaps; these never impose an aisle or modify placement policy. */
export function placementClearance(
  objects: PlanObject[],
  floor: PlanFloor,
): { boundary: number; obstacle: number | null } {
  const distance = (a: [number, number][], b: [number, number][]) => {
    let nearest = Infinity;
    const edges = polygonEdges(b);
    for (const [p, q] of polygonEdges(a)) {
      for (const [r, s] of edges) {
        if (segmentsIntersect(p, q, r, s)) {
          return 0;
        }
        nearest = Math.min(
          nearest,
          segmentDistance(p, r, s),
          segmentDistance(q, r, s),
          segmentDistance(r, p, q),
          segmentDistance(s, p, q),
        );
      }
    }
    return nearest;
  };
  let boundary = Infinity,
    obstacle = Infinity;
  const blocked = [
    ...floor.zones.filter((zone) => zone.type === 'blocked').map((zone) => zone.polygon),
    ...floor.objects
      .filter(
        (object) => object.collidable && !objects.some((candidate) => candidate.id === object.id),
      )
      .map(footprint),
    ...staticBlockers(
      floor,
      Math.max(...objects.map((object) => object.dimensions[1] * object.scale[1])),
    ),
  ];
  for (const object of objects) {
    const shape = footprint(object);
    boundary = Math.min(
      boundary,
      insideBoundary(shape, floor.boundary) ? distance(shape, floor.boundary) : 0,
    );
    for (const polygon of blocked) {
      obstacle = Math.min(obstacle, overlaps(shape, polygon) ? 0 : distance(shape, polygon));
    }
  }
  return { boundary, obstacle: Number.isFinite(obstacle) ? obstacle : null };
}
export function objectFromDrawing(points: [number, number][], object: PlanObject): PlanObject {
  const bounds = polygonBounds(points);
  const position: [number, number] = [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  ];
  return {
    ...object,
    position,
    yawRadians: 0,
    scale: [1, 1, 1],
    dimensions: [bounds.maxX - bounds.minX, object.dimensions[1], bounds.maxZ - bounds.minZ],
    polygon: toLocal(points, position),
  };
}
export function resizeObject(
  object: PlanObject,
  width: number,
  height: number,
  depth: number,
): PlanObject {
  // Avatar proportions are a locked ergonomic benchmark — ignore resizes.
  if (object.recipe === 'avatar') {
    return object;
  }
  const bounds = polygonBounds(object.polygon);
  const previousWidth = bounds.maxX - bounds.minX,
    previousDepth = bounds.maxZ - bounds.minZ;
  const sx = Number.isFinite(width) && width > 0 && previousWidth > 0 ? width / previousWidth : 1;
  const sz = Number.isFinite(depth) && depth > 0 && previousDepth > 0 ? depth / previousDepth : 1;
  const resized: PlanObject = {
    ...object,
    dimensions: [width, height, depth],
    polygon: object.polygon.map(([x, z]) => [x * sx, z * sz]),
    polePositions: object.polePositions.map(([x, z]) => [x * sx, z * sz]),
  };
  if (
    object.circulationDesign &&
    object.circulationDesign.role !== 'upper' &&
    object.recipe !== 'elevator'
  ) {
    resized.circulationDesign = {
      ...object.circulationDesign,
      clearWidth: object.circulationDesign.layout === 'switchback' ? (width - 0.2) / 2 : width,
    };
  }
  return fitCirculation(resized);
}

export function resizeFromPointer(
  object: PlanObject,
  start: [number, number],
  point: [number, number],
  signs: [number, number],
  centered: boolean,
  aspect: boolean,
  snap: number,
): PlanObject {
  const [ma, mb, mc, md] = object.planarMatrix ?? [1, 0, 0, 1];
  const determinant = ma * md - mb * mc;
  const local = (worldPoint: [number, number]) => {
    const [x, z] = toLocal([worldPoint], object.position, object.yawRadians)[0]!;
    const sx = x / object.scale[0],
      sz = z / object.scale[2];
    return [(md * sx - mc * sz) / determinant, (-mb * sx + ma * sz) / determinant];
  };
  const a = local(start),
    b = local(point);
  let width = Math.max(0.1, object.dimensions[0] + (b[0]! - a[0]!) * signs[0] * (centered ? 2 : 1));
  let depth = Math.max(0.1, object.dimensions[2] + (b[1]! - a[1]!) * signs[1] * (centered ? 2 : 1));
  if (aspect) {
    let factor =
      Math.abs(width / object.dimensions[0] - 1) >= Math.abs(depth / object.dimensions[2] - 1)
        ? width / object.dimensions[0]
        : depth / object.dimensions[2];
    if (snap > 0) {
      factor =
        Math.max(snap, Math.round((object.dimensions[0] * factor) / snap) * snap) /
        object.dimensions[0];
    }
    factor = Math.max(factor, 0.1 / Math.min(object.dimensions[0], object.dimensions[2]));
    width = object.dimensions[0] * factor;
    depth = object.dimensions[2] * factor;
  } else if (snap > 0) {
    width = Math.max(0.1, Math.round(width / snap) * snap);
    depth = Math.max(0.1, Math.round(depth / snap) * snap);
  }
  return resizeObject(object, width, object.dimensions[1], depth);
}
