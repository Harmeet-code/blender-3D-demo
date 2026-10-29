import {
  pointInPolygon,
  polygonEdges,
  polygonBounds,
  transformFootprint,
  segmentDistance,
  segmentsIntersect,
} from '@/utils/geometry/polygon.ts';
import {
  isBooth,
  isShellStructure,
  polygonSchema,
  type PlanFloor,
  type PlanObject,
} from './types.ts';
import { referencePoint, referenceYaw } from './coordinates.ts';
import { wallSpans, wallHeightFor } from '@/features/building/model/wall-spans.ts';
import { authoredWallBoxes } from '@/features/building/model/authored-walls.ts';
import { boxFootprint } from '@/features/building/model/booth-physical.ts';
import { inventory } from './inventory.ts';
import { showOfficeSpatialLayout } from './show-office.ts';
import {
  shippingSpatialLayout,
  shippingWorldObstacles,
  shippingWorldPolygon,
} from './shipping-spatial.ts';
import { diningVendorServiceWindow } from './dining.ts';
import { ShapeUtils, Vector2 } from 'three';
import { boothDesignError, boothNavigationPolygons, polygonGap, sharesBoothWall } from './booth.ts';
import { tentCollisionLocal, tentDesignError } from './tent.ts';
import { entranceCollisionLocal, entranceDesignError, entranceDimensionLimits } from './entrance.ts';
import { benchDesignError, benchObstacleLocal } from './bench.ts';
import { tableDesignError, tableObstacleLocal } from './table.ts';
import { barrierDesignError, barrierObstacleLocal } from './barrier.ts';
import { planterDesignError, planterObstacleLocal } from './planter.ts';
import { binDesignError } from './bin.ts';
import { washroomDesignError, washroomObstacleLocal } from './washroom.ts';
import { kidsDesignError, kidsObstacleLocal } from './kids.ts';
import { avatarDesignError } from './avatar.ts';
import { infoDesignError, infoObstaclesLocal } from './information.ts';
import { kioskDesignError, kioskQueueLocal } from './kiosk.ts';
import { waterDesignError } from './water.ts';
import { firstAidDesignError } from './firstaid.ts';
import { exitDesignError, exitClearLocal, exitCollisionFor } from './exit.ts';
import {
  circulationApproaches,
  circulationError,
  circulationHeight,
  fitCirculation,
} from './circulation.ts';
import {
  washRackApproachLocal,
  washRackObstacleLocal,
  washRackRowConnections,
} from './wash-rack-spatial.ts';

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

function diningVendorRelation(
  dining: PlanObject,
  vendor: PlanObject,
): { error: string | null; buffer: [number, number][] | null } {
  if (dining.recipe !== 'dining' || !dining.diningVendorReferenceId) {
    return { error: null, buffer: null };
  }
  if (
    vendor.id !== dining.diningVendorReferenceId ||
    !['food-kiosk', 'food-truck'].includes(vendor.recipe)
  ) {
    return {
      error: `${dining.name} must link to a food kiosk or food truck on the same floor.`,
      buffer: null,
    };
  }
  const edgeIndex = dining.diningVendorServiceEdge;
  if (edgeIndex === undefined || edgeIndex >= dining.polygon.length) {
    return { error: `${dining.name} needs a valid vendor-facing footprint edge.`, buffer: null };
  }
  const service = diningVendorServiceWindow(dining);
  const [a, b] = [
    dining.polygon[edgeIndex]!,
    dining.polygon[(edgeIndex + 1) % dining.polygon.length]!,
  ];
  const edge = objectPoints(dining, [a, b]);
  const midpoint: [number, number] = [
    (edge[0]![0] + edge[1]![0]) / 2,
    (edge[0]![1] + edge[1]![1]) / 2,
  ];
  const windowCenter = objectPoints(vendor, [[0, vendor.dimensions[2] / 2]])[0]!;
  const windowNormal: [number, number] = [Math.sin(vendor.yawRadians), Math.cos(vendor.yawRadians)];
  const windowAxis: [number, number] = [Math.cos(vendor.yawRadians), -Math.sin(vendor.yawRadians)];
  const dx = midpoint[0] - windowCenter[0],
    dz = midpoint[1] - windowCenter[1];
  const distance = Math.hypot(dx, dz);
  const facing = distance > 1e-6 ? (dx * windowNormal[0] + dz * windowNormal[1]) / distance : -1;
  const edgeDx = edge[1]![0] - edge[0]![0],
    edgeDz = edge[1]![1] - edge[0]![1];
  const edgeLength = Math.hypot(edgeDx, edgeDz) || 1;
  const parallel = Math.abs((edgeDx * windowAxis[0] + edgeDz * windowAxis[1]) / edgeLength);
  if (!service) {
    return {
      error: 'The linked dining area needs a valid 4 m vendor service buffer.',
      buffer: null,
    };
  }
  if (Math.abs(distance - 4) > 0.15 || facing < 0.98 || parallel < 0.98) {
    return {
      error:
        'Keep the linked vendor service window 4 m from the selected dining edge and aligned to the rendered service face.',
      buffer: null,
    };
  }
  const halfWidth = Math.min(vendor.dimensions[0] / 2, edgeLength / 2);
  const edgeAxis: [number, number] = [edgeDx / edgeLength, edgeDz / edgeLength];
  const windowStart: [number, number] = [
    windowCenter[0] - windowAxis[0] * halfWidth,
    windowCenter[1] - windowAxis[1] * halfWidth,
  ];
  const windowEnd: [number, number] = [
    windowCenter[0] + windowAxis[0] * halfWidth,
    windowCenter[1] + windowAxis[1] * halfWidth,
  ];
  const edgeStart: [number, number] = [
    midpoint[0] - edgeAxis[0] * halfWidth,
    midpoint[1] - edgeAxis[1] * halfWidth,
  ];
  const edgeEnd: [number, number] = [
    midpoint[0] + edgeAxis[0] * halfWidth,
    midpoint[1] + edgeAxis[1] * halfWidth,
  ];
  return { error: null, buffer: [windowStart, windowEnd, edgeEnd, edgeStart] };
}
export function baseFootprint(object: PlanObject): [number, number][] {
  return objectPoints(object, object.polygon);
}
export function visualHeight(object: PlanObject): number {
  if (object.circulationDesign && !object.legacyPortalLanding) {
    return circulationHeight(object);
  }
  if (object.recipe === 'information') {
    return Math.max(object.dimensions[1], object.infoSignHeight + 0.2) * object.scale[1];
  }
  if (object.recipe === 'first-aid') {
    return (Math.max(2.5, object.dimensions[1] + 0.35) + 0.2) * object.scale[1];
  }
  if (object.recipe === 'exit') {
    return (object.dimensions[1] + 0.47) * object.scale[1];
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

/** Shared authored-object collision and navigation footprints in floor world coordinates. */
export function objectObstaclePolygons(
  object: PlanObject,
  siblings: readonly PlanObject[] = [object],
): [number, number][][] {
  if (!object.collidable && object.recipe !== 'shipping') {
    return [];
  }
  if (isBooth(object) || isShellStructure(object)) {
    return boothNavigationPolygons(object);
  }
  const mapped = (local: [number, number][][]) =>
    local.map((polygon) => objectPoints(object, polygon));
  switch (object.recipe) {
    case 'shipping':
      return shippingWorldObstacles(object);
    case 'wash-rack':
      return object.washRackVariant
        ? mapped(washRackObstacleLocal(object, washRackRowConnections(object, siblings)))
        : [footprint(object)];
    case 'barn-tent':
      return mapped(tentCollisionLocal(object));
    case 'entrance':
      return mapped(entranceCollisionLocal(object));
    case 'washroom-men':
    case 'washroom-women':
      return [objectPoints(object, washroomObstacleLocal(object))];
    case 'kids-zone':
      return mapped(kidsObstacleLocal(object));
    case 'exit':
      return mapped(exitCollisionFor(object));
    case 'information':
      return mapped(infoObstaclesLocal(object));
    case 'bench':
      return [objectPoints(object, benchObstacleLocal(object))];
    case 'table':
    case 'chair':
      return [objectPoints(object, tableObstacleLocal(object))];
    case 'barrier':
      return mapped(barrierObstacleLocal(object));
    case 'planter':
      return [objectPoints(object, planterObstacleLocal(object))];
    default:
      return [footprint(object)];
  }
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
    exitDesignError(object) ??
    benchDesignError(object) ??
    tableDesignError(object) ??
    barrierDesignError(object) ??
    planterDesignError(object) ??
    binDesignError(object);
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
  const officeLayout = object.recipe === 'show-office' ? showOfficeSpatialLayout(object) : null;
  const officeLocal = (polygon: [number, number][]) => polygon.map(([x, z]) => [x, z - object.dimensions[2] / 2] as [number, number]);
  const officeAppendages = officeLayout
    ? [officeLayout.footprints.ramp, officeLayout.footprints.landing]
        .filter((polygon) => polygon.length >= 3)
        .map((polygon) => objectPoints(object, officeLocal(polygon)))
    : [];
  if (officeAppendages.some((polygon) => !insideBoundary(polygon, floor.boundary))) {
    return 'Keep the complete accessible ramp and landing inside the floor boundary.';
  }
  const shippingPlan = object.recipe === 'shipping' ? shippingSpatialLayout(object) : null;
  const shippingFootprints =
    shippingPlan?.placementFootprints.map((polygon) => shippingWorldPolygon(object, polygon)) ?? [];
  if (shippingFootprints.some((polygon) => !insideBoundary(polygon, floor.boundary))) {
    return 'Keep the complete trailer and stair footprint inside the floor boundary.';
  }
  // Reserve approaches in both placement orders. These are clear floor, not navmesh obstacles.
  const placementObjects = [...floor.objects.filter((item) => item.id !== object.id), object];
  for (const other of placementObjects) {
    if (other.id === object.id) {continue;}
    const shippingParkingPair =
      (object.recipe === 'shipping' && other.recipe === 'parking-lot') ||
      (object.recipe === 'parking-lot' && other.recipe === 'shipping');
    if (shippingParkingPair) {
      const shipping = object.recipe === 'shipping' ? object : other;
      const parking = object.recipe === 'parking-lot' ? object : other;
      const width = Math.max(4.5, shipping.dimensions[0]);
      const apron = shippingWorldPolygon(shipping, [
        [-width / 2, -16.5], [width / 2, -16.5], [width / 2, 0], [-width / 2, 0],
      ]);
      if (overlaps(apron, footprint(parking))) {
        return 'Keep the 16.5 m forward truck turning apron clear of parking bays.';
      }
    }
    const washTentPair =
      (object.recipe === 'wash-rack' && other.recipe === 'barn-tent') ||
      (object.recipe === 'barn-tent' && other.recipe === 'wash-rack');
    if (washTentPair && polygonGap(footprint(object), footprint(other)) < 3 - 1e-6) {
      return 'Keep wash racks at least 3 m from barn tents for drainage clearance.';
    }
  }
  const reserved = (item: PlanObject) =>
    item.recipe === 'wash-rack' && item.washRackVariant && item.collidable
      ? [objectPoints(item, washRackApproachLocal(item))]
      : item.recipe === 'food-kiosk'
        ? [objectPoints(item, kioskQueueLocal(item))]
        : item.recipe === 'exit'
          ? [objectPoints(item, exitClearLocal(item))]
          : [];
  const solids = (item: PlanObject) => [
    ...(item.recipe === 'show-office'
      ? (() => {
          const layout = showOfficeSpatialLayout(item);
          const localize = (polygon: [number, number][]) => polygon.map(([x, z]) => [x, z - item.dimensions[2] / 2] as [number, number]);
          return [layout.footprints.shell, layout.footprints.landing]
            .filter((polygon) => polygon.length >= 3)
            .map((polygon) => objectPoints(item, localize(polygon)));
        })()
      : []),
    ...(item.recipe === 'shipping'
      ? shippingSpatialLayout(item).appendageFootprints.map((polygon) =>
          shippingWorldPolygon(item, polygon),
        )
      : isBooth(item) || isShellStructure(item)
        ? objectObstaclePolygons(item)
        : item.recipe === 'wash-rack'
          ? objectObstaclePolygons(item, placementObjects)
          : [footprint(item)]),
    ...(item.recipe === 'exit' && item.exitOpen
      ? exitCollisionFor(item).map((polygon) => objectPoints(item, polygon))
      : []),
  ];
  const linkedDining = placementObjects.filter(
    (item) => item.recipe === 'dining' && item.diningVendorReferenceId,
  );
  for (const dining of linkedDining) {
    const vendor = placementObjects.find((item) => item.id === dining.diningVendorReferenceId);
    if (!vendor) {
      return `${dining.name} is linked to a missing vendor. Choose a food kiosk or food truck on this floor.`;
    }
    const relation = diningVendorRelation(dining, vendor);
    if (relation.error) {
      return relation.error;
    }
  }
  const fixed = [
    ...floor.zones.filter((zone) => zone.type === 'blocked').map((zone) => zone.polygon),
    ...staticBlockers(floor, visualHeight(object)),
  ];
  const others = floor.objects.filter(
    (other) => other.id !== object.id && (other.collidable || other.recipe === 'shipping'),
  );
  for (const dining of linkedDining) {
    const vendor = placementObjects.find((item) => item.id === dining.diningVendorReferenceId)!;
    const relation = diningVendorRelation(dining, vendor);
    if (!relation.buffer) {
      continue;
    }
    if (fixed.some((obstacle) => overlaps(relation.buffer!, obstacle))) {
      return 'Keep the 4 m linked vendor service buffer clear of walls and blocked zones.';
    }
    const obstruction = placementObjects.find(
      (candidate) =>
        candidate.id !== dining.id &&
        candidate.id !== vendor.id &&
        candidate.collidable &&
        solids(candidate).some((solid) => overlaps(relation.buffer!, solid)),
    );
    if (obstruction) {
      return `Keep ${obstruction.name} outside the 4 m linked vendor service buffer.`;
    }
  }
  if (object.collidable) {
    for (const dining of linkedDining) {
      if (object.id === dining.id || object.id === dining.diningVendorReferenceId) {
        continue;
      }
      const vendor = placementObjects.find((item) => item.id === dining.diningVendorReferenceId);
      const buffer = vendor ? diningVendorRelation(dining, vendor).buffer : null;
      if (buffer && solids(object).some((solid) => overlaps(buffer, solid))) {
        return 'Keep this object outside the 4 m linked vendor service buffer.';
      }
    }
  }
  if (
    reserved(object).some(
      (area) =>
        fixed.some((obstacle) => overlaps(area, obstacle)) ||
        others.some((other) => solids(other).some((obstacle) => overlaps(area, obstacle))),
    )
  ) {
    return object.recipe === 'wash-rack'
      ? 'Keep the wash-rack entrance approach free of objects, blocked zones and walls.'
      : 'Keep the entire service queue or exit approach free of objects, blocked zones and walls.';
  }
  if (
    object.recipe === 'wash-rack' &&
    object.washRackVariant &&
    object.collidable &&
    reserved(object).some((approach) => !insideBoundary(approach, floor.boundary))
  ) {
    return 'Keep the wash-rack entrance approach inside the floor boundary.';
  }
  if (
    object.collidable &&
    others.some((other) =>
      reserved(other).some((area) => solids(object).some((obstacle) => overlaps(area, obstacle))),
    )
  ) {
    return 'This position obstructs a reserved kiosk queue or exit approach.';
  }
  if (
    object.recipe === 'exit' &&
    object.exitOpen &&
    solids(object).some(
      (solid) =>
        !insideBoundary(solid, floor.boundary) ||
        fixed.some((obstacle) => overlaps(solid, obstacle)) ||
        others.some((other) => solids(other).some((obstacle) => overlaps(solid, obstacle))),
    )
  ) {
    return 'Keep the open exit leaf inside the floor and clear of objects and walls.';
  }
  if (
    object.collidable &&
    others.some(
      (other) =>
        other.recipe === 'exit' &&
        other.exitOpen &&
        solids(other).some((obstacle) => overlaps(shape, obstacle)),
    )
  ) {
    return 'This position intersects an open exit leaf.';
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
      ...floor.objects
        .filter((other) => other.id !== object.id && other.collidable)
        .flatMap(solids),
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
    const objectSolids = solids(object);
    const collision = floor.objects.find(
      (other) =>
        other.id !== object.id &&
        (other.collidable || other.recipe === 'shipping') &&
        !(
          ((isBooth(object) || isShellStructure(object)) &&
            inventory.find((item) => item.id === other.recipe)?.category === 'Furniture') ||
          ((isBooth(other) || isShellStructure(other)) &&
            inventory.find((item) => item.id === object.recipe)?.category === 'Furniture')
        ) &&
        objectSolids.some((solid) => solids(other).some((obstacle) => overlaps(solid, obstacle))),
    );
    if (collision) {
      return `Overlaps ${collision.name}. Move or resize the object.`;
    }
    const queueBlock = floor.objects.find(
      (other) =>
        other.id !== object.id &&
        other.recipe === 'food-kiosk' &&
        objectSolids.some((solid) => overlaps(solid, objectPoints(other, kioskQueueLocal(other)))),
    );
    if (queueBlock) {
      return `Keep the ${queueBlock.name} queue clear zone unobstructed.`;
    }
    const exitBlock = floor.objects.find(
      (other) =>
        other.id !== object.id &&
        other.recipe === 'exit' &&
        objectSolids.some((solid) => overlaps(solid, objectPoints(other, exitClearLocal(other)))),
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
        (isBooth(object) || isShellStructure(object)) &&
        (isBooth(other) || isShellStructure(other)) &&
        !sharesBoothWall(object, other) &&
        polygonGap(shape, footprint(other)) < margin + (other.boothDesign?.clearance ?? 0) - 1e-7,
    );
    if (close) {
      return `Leave ${(margin + (close.boothDesign?.clearance ?? 0)).toFixed(2)} m combined clearance from ${close.name}, or snap two closed walls flush.`;
    }
  }
  return null;
}

/** Runtime-owned check for preserving route connectivity when a candidate document is committed. */
export type PlacementReachabilityCheck = (candidateFloor: PlanFloor) => string | null;

/** Validate every changed object, then allow navigation runtime to veto the complete candidate. */
export function validatePlacementBatch(
  changedObjects: readonly PlanObject[],
  candidateFloor: PlanFloor,
  checkReachability?: PlacementReachabilityCheck,
): string | null {
  for (const object of changedObjects) {
    const error = placementError(object, candidateFloor);
    if (error) {
      return error;
    }
  }
  return checkReachability?.(candidateFloor) ?? null;
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

/**
 * Zone polygons are stored in world metres, so a group transform moves the vertices directly.
 * The rotation follows the scene's Y-axis convention, matching the footprint transform.
 */
export function transformZonePolygon(
  polygon: readonly [number, number][],
  dx: number,
  dz: number,
  yaw: number,
  pivot: [number, number],
): [number, number][] {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return polygon.map(([x, z]) => {
    const rx = x - pivot[0];
    const rz = z - pivot[1];
    return [pivot[0] + rx * cosine + rz * sine + dx, pivot[1] - rx * sine + rz * cosine + dz] as [
      number,
      number,
    ];
  });
}

/** Rotate a placement about a pivot using the scene's Y-axis convention. */
export function rotatePosition(
  position: [number, number],
  pivot: [number, number],
  yaw: number,
): [number, number] {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const rx = position[0] - pivot[0];
  const rz = position[1] - pivot[1];
  return [pivot[0] + rx * cosine + rz * sine, pivot[1] - rx * sine + rz * cosine];
}

const connectorResizePresets: Partial<Record<PlanObject['recipe'], readonly [number, number][]>> = {
  stairs: [
    [2, 7.48],
    [2.5, 7.48],
    [3, 7.48],
    [2, 9],
    [2.5, 9],
    [3, 9],
  ],
  elevator: [
    [2.5, 2.5],
    [3, 3],
    [3.5, 3.5],
  ],
  escalator: [
    [2, 7.2],
    [2.5, 7.2],
    [3, 7.2],
    [2, 9],
    [2.5, 9],
    [3, 9],
  ],
};

/**
 * A ramp is dimensioned by its accessible slope, not by a free width/depth pair: the clear width
 * stays within 1.2–3 m and the run keeps a 1:12–1:20 slope with the landings counted outside it.
 */
export function rampResizeLimits(object: PlanObject): {
  width: [number, number];
  depth: [number, number];
} {
  const design = object.circulationDesign;
  const landing = design?.landingLength ?? 1.5;
  const rise = object.dimensions[1] > 0 ? object.dimensions[1] : 0.5;
  const switchback = design?.layout === 'switchback';
  const flights = switchback ? 2 : Math.max(1, Math.ceil(rise / 0.76));
  const landings = switchback ? 2 * landing : (flights + 1) * landing;
  const depth = (ratio: number) => (switchback ? (rise * ratio) / 2 : rise * ratio) + landings;
  return {
    width: switchback ? [2.6, 6.2] : [1.2, 3],
    depth: [depth(12), depth(20)],
  };
}

/** Keep an accessible ramp inside its slope band instead of the generic dimension range. */
export function resizeRampSafely(
  object: PlanObject,
  width: number,
  height: number,
  depth: number,
): PlanObject {
  const limits = rampResizeLimits(object);
  const safeWidth = Math.min(limits.width[1], Math.max(limits.width[0], width));
  const safeDepth = Math.min(20, Math.max(limits.depth[0], Math.min(limits.depth[1], depth)));
  return resizeObject(object, safeWidth, height, safeDepth);
}

/** Keep vertical connectors on validated footprint presets while retaining ordinary numeric editing. */
export function resizeObjectSafely(
  object: PlanObject,
  width: number,
  height: number,
  depth: number,
): PlanObject {
  if (object.recipe === 'entrance') {
    const dimensions = [width, height, depth].map((value, axis) => {
      const [min, max] = entranceDimensionLimits[axis]!;
      return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : object.dimensions[axis]!;
    }) as [number, number, number];
    return resizeObject(object, ...dimensions);
  }
  if (object.recipe === 'ramp') {
    return resizeRampSafely(object, width, height, depth);
  }
  const presets = connectorResizePresets[object.recipe];
  if (!presets) {
    return resizeObject(object, width, height, depth);
  }
  const safe = presets.reduce((best, candidate) => {
    const score =
      ((candidate[0] - width) / Math.max(width, 0.1)) ** 2 +
      ((candidate[1] - depth) / Math.max(depth, 0.1)) ** 2;
    const bestScore =
      ((best[0] - width) / Math.max(width, 0.1)) ** 2 +
      ((best[1] - depth) / Math.max(depth, 0.1)) ** 2;
    return score < bestScore ? candidate : best;
  });
  return resizeObject(object, safe[0], height, safe[1]);
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
  return resizeObjectSafely(object, width, object.dimensions[1], depth);
}
