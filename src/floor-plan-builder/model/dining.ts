import {
  boundaryDistance,
  pointInPolygon,
  polygonEdges,
  polygonBounds,
  polygonContains,
  polygonsOverlap,
  segmentDistance,
  signedArea,
  transformFootprint,
} from '@/utils/geometry/polygon.ts';
import type { Point2 as GeometryPoint2 } from '@/utils/geometry/polygon.ts';
import type { PlanObject } from './types.ts';

export type Point2 = [number, number];
export type DiningStyle = NonNullable<PlanObject['diningStyle']>;
export type DiningChairStyle = NonNullable<PlanObject['diningChairStyle']>;
export type DiningCenterpiece = NonNullable<PlanObject['diningCenterpiece']>;
export type DiningPropKind =
  | 'umbrella'
  | 'pergola-post'
  | 'planter'
  | 'rope-post'
  | 'host'
  | 'bus-tub';

export interface DiningChairPlacement {
  id: string;
  center: Point2;
  yawRadians: number;
  style: DiningChairStyle;
  occupied: boolean;
  width: number;
  depth: number;
  height: number;
  seatHeight: number;
  seatDepth: number;
  backHeight: number;
  footrestHeight: number;
  backTiltRadians: number;
  footprint: Point2[];
  /** Conservative collision shape: empty chairs tuck under a table; occupied chairs extend behind it. */
  blockerFootprint: Point2[];
  seatApproach: Point2[];
  /** Safe arrival anchor outside the chair blocker, at floor level. */
  approachPoint: Point2;
  target: Point2;
  facingTarget: Point2;
}

export interface DiningTablePlacement {
  id: string;
  center: Point2;
  yawRadians: number;
  width: number;
  depth: number;
  height: number;
  topShape: 'rectangular' | 'round';
  footprint: Point2[];
  style: DiningStyle;
  centerpiece: DiningCenterpiece;
  tablecloth: boolean;
  chairs: DiningChairPlacement[];
}

export interface DiningAisle {
  id: string;
  centerline: Point2[];
  width: number;
  polygon: Point2[];
}

export interface DiningPropPlacement {
  id: string;
  kind: DiningPropKind;
  center: Point2;
  yawRadians: number;
  footprint: Point2[];
  collidable: boolean;
}

export interface DiningVendorServiceWindow {
  referenceId: string;
  edgeIndex: number;
  clearBuffer: 4;
  polygon: Point2[];
  fitsBoundary: boolean;
}

export interface DiningSeatedAvatar {
  id: string;
  chairId: string;
  position: Point2;
  seatHeight: number;
  yawRadians: number;
  facingTarget: Point2;
}

export interface DiningLayout {
  origin: Point2;
  tables: DiningTablePlacement[];
  aisles: DiningAisle[];
  props: DiningPropPlacement[];
  seatedAvatars: DiningSeatedAvatar[];
  capacity: number;
  requestedCapacity: number;
  warnings: string[];
}

export const DINING_DEFAULTS = {
  area: [8, 3, 6] as const,
  table: { width: 1.2, depth: 0.8, height: 0.75 },
  chair: {
    width: 0.5,
    depth: 0.5,
    height: 0.85,
    seatHeight: 0.45,
    seatDepth: 0.42,
    backHeight: 0.4,
    backTiltRadians: (8 * Math.PI) / 180,
  },
  barStool: { seatHeight: 0.75, footrestHeight: 0.3 },
  mainAisle: 2,
  intertableAisle: 1.5,
  occupiedBackClearance: 1,
} as const;

export function diningChairDimensions(style: DiningChairStyle) {
  return style === 'bar-stool'
    ? {
        ...DINING_DEFAULTS.chair,
        height: 1.05,
        seatHeight: DINING_DEFAULTS.barStool.seatHeight,
        backHeight: 0.28,
        footrestHeight: DINING_DEFAULTS.barStool.footrestHeight,
      }
    : { ...DINING_DEFAULTS.chair, footrestHeight: 0 };
}

export function standaloneChairDefaults(style: DiningChairStyle = 'plastic-stackable') {
  const dimensions = diningChairDimensions(style);
  return {
    chairStyle: style,
    dimensions: [dimensions.width, dimensions.height, dimensions.depth] as [number, number, number],
  };
}

/** Apply real chair dimensions to an inventory chair; no polygon/object scaling is used. */
export function applyStandaloneChairStyle(object: PlanObject, style: DiningChairStyle): PlanObject {
  if (object.recipe !== 'chair') {
    return object;
  }
  return { ...object, ...standaloneChairDefaults(style) };
}

/** Complete persisted defaults for newly authored dining areas; legacy objects remain optional. */
export function diningObjectDefaults() {
  return {
    diningStyle: 'grid4' as const,
    diningChairStyle: 'plastic-stackable' as const,
    diningSeed: 42,
    diningOccupancy: 0,
    diningCenterpiece: 'none' as const,
    diningTablecloth: false,
    diningShade: 'none' as const,
    diningBoundary: 'none' as const,
    diningHost: false,
    diningBusTub: false,
    diningTableCount: 6,
  };
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let n = value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function centroid(polygon: readonly GeometryPoint2[]): Point2 {
  const area = signedArea(polygon);
  if (Math.abs(area) < 1e-8) {
    const bounds = polygonBounds(polygon);
    return [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2];
  }
  let x = 0;
  let z = 0;
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    const cross = point[0] * next[1] - next[0] * point[1];
    x += (point[0] + next[0]) * cross;
    z += (point[1] + next[1]) * cross;
  });
  const center: Point2 = [x / (6 * area), z / (6 * area)];
  return pointInPolygon(center, polygon) ? center : interiorSample(polygon);
}

/** Find a stable interior point for concave polygons whose area centroid lies outside. */
function interiorSample(polygon: readonly GeometryPoint2[]): Point2 {
  const bounds = polygonBounds(polygon);
  let best: Point2 | null = null;
  let clearance = -1;
  // Deterministic sampling is deliberately bounded; dining layouts are small plan polygons.
  for (let row = 1; row < 32; row += 1) {
    for (let column = 1; column < 32; column += 1) {
      const candidate: Point2 = [
        bounds.minX + ((bounds.maxX - bounds.minX) * column) / 32,
        bounds.minZ + ((bounds.maxZ - bounds.minZ) * row) / 32,
      ];
      if (!pointInPolygon(candidate, polygon)) {
        continue;
      }
      const distance = boundaryDistance(candidate, polygon);
      if (distance > clearance) {
        best = candidate;
        clearance = distance;
      }
    }
  }
  return best ?? [polygon[0]![0], polygon[0]![1]];
}

function rect(center: Point2, width: number, depth: number, yaw = 0): Point2[] {
  return transformFootprint(
    [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [width / 2, depth / 2],
      [-width / 2, depth / 2],
    ],
    center,
    yaw,
  );
}

function circle(center: Point2, radius: number, vertices = 20): Point2[] {
  return Array.from({ length: vertices }, (_, index) => {
    const angle = (index / vertices) * Math.PI * 2;
    return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
  });
}

function polygonGap(a: Point2[], b: Point2[]): number {
  if (polygonsOverlap(a, b)) {
    return 0;
  }
  let nearest = Infinity;
  for (const point of a) {
    for (const [start, end] of polygonEdges(b)) {
      nearest = Math.min(nearest, segmentDistance(point, start, end));
    }
  }
  for (const point of b) {
    for (const [start, end] of polygonEdges(a)) {
      nearest = Math.min(nearest, segmentDistance(point, start, end));
    }
  }
  return nearest;
}

function vector(center: Point2, distance: number, angle: number): Point2 {
  return [center[0] + Math.cos(angle) * distance, center[1] + Math.sin(angle) * distance];
}

/** Three's local +Z forward vector, expressed as rotation around world +Y. */
function yawFromForwardAngle(angle: number): number {
  return Math.PI / 2 - angle;
}

function styleFor(object: PlanObject): DiningStyle {
  return object.diningStyle ?? 'grid4';
}

function requestedSeats(style: DiningStyle): number {
  return style === 'grid6' || style === 'round6'
    ? 6
    : style === 'round8'
      ? 8
      : style === 'communal-long'
        ? 8
        : style === 'cafe-bistro'
          ? 2
          : 4;
}

function chairSeats(
  tableCenter: Point2,
  tableWidth: number,
  tableDepth: number,
  style: DiningStyle,
): Array<{ center: Point2; facing: number }> {
  const seats: Array<{ center: Point2; facing: number }> = [];
  const edgeGap = 0.58;
  if (style === 'round6' || style === 'round8') {
    const count = style === 'round6' ? 6 : 8;
    const radius = 0.95;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      seats.push({ center: vector(tableCenter, radius, angle), facing: angle + Math.PI });
    }
    return seats;
  }
  if (style === 'grid6') {
    for (const side of [-1, 1]) {
      for (const x of [-0.36, 0, 0.36]) {
        seats.push({
          center: [tableCenter[0] + x, tableCenter[1] + side * (tableDepth / 2 + 0.48)],
          facing: (side * -Math.PI) / 2,
        });
      }
    }
    return seats;
  }
  if (style === 'grid4') {
    for (const side of [-1, 1]) {
      for (const x of [-0.3, 0.3]) {
        seats.push({
          center: [tableCenter[0] + x, tableCenter[1] + side * (tableDepth / 2 + 0.48)],
          facing: (side * -Math.PI) / 2,
        });
      }
    }
    return seats;
  }
  if (style === 'communal-long' || style === 'rows-banquet') {
    for (const side of [-1, 1]) {
      const count = style === 'rows-banquet' ? 4 : 4;
      for (let index = 0; index < count; index += 1) {
        const x = ((index + 0.5) / count - 0.5) * tableWidth;
        seats.push({
          center: [tableCenter[0] + x, tableCenter[1] + side * (tableDepth / 2 + 0.48)],
          facing: (side * -Math.PI) / 2,
        });
      }
    }
    return seats;
  }
  if (style === 'cafe-bistro') {
    return [-1, 1].map((side) => ({
      center: [tableCenter[0] + side * (tableWidth / 2 + edgeGap), tableCenter[1]],
      facing: side < 0 ? 0 : Math.PI,
    }));
  }
  for (const side of [-1, 1]) {
    seats.push({
      center: [tableCenter[0], tableCenter[1] + side * (tableDepth / 2 + 0.48)],
      facing: (side * -Math.PI) / 2,
    });
  }
  for (const side of [-1, 1]) {
    seats.push({
      center: [tableCenter[0] + side * (tableWidth / 2 + edgeGap), tableCenter[1]],
      facing: side < 0 ? 0 : Math.PI,
    });
  }
  return seats;
}

function makeChair(
  id: string,
  center: Point2,
  facingAngle: number,
  occupied: boolean,
  style: DiningChairStyle,
  tableCenter: Point2,
): DiningChairPlacement {
  const { width, depth, seatHeight, height, backHeight, seatDepth, footrestHeight } =
    diningChairDimensions(style);
  const yawRadians = yawFromForwardAngle(facingAngle);
  const footprint = rect(center, width, depth, yawRadians);
  // Chair front points at the table; the blocker includes the backrest and occupied body.
  const blockerCenter = occupied
    ? vector(center, 0.18, facingAngle + Math.PI)
    : vector(center, 0.2, facingAngle);
  const blockerFootprint = rect(blockerCenter, width, 0.9, yawRadians);
  // Empty chairs tuck 20 cm under the tabletop; occupied body extends 40 cm farther behind the chair.
  // Keep a separate 30 cm clear approach behind each blocker.
  const blockerBack = occupied ? 0.18 + 0.9 / 2 : 0.9 / 2 - 0.2;
  const approachCenter = vector(center, blockerBack + 0.45, facingAngle + Math.PI);
  return {
    id,
    center,
    yawRadians,
    style,
    occupied,
    width,
    depth,
    height,
    seatHeight,
    seatDepth,
    backHeight,
    footprint,
    blockerFootprint,
    footrestHeight,
    backTiltRadians: DINING_DEFAULTS.chair.backTiltRadians,
    seatApproach: rect(approachCenter, 0.5, 0.3, yawRadians),
    target: approachCenter,
    approachPoint: approachCenter,
    facingTarget: tableCenter,
  };
}

function candidateCenters(object: PlanObject, origin: Point2, style: DiningStyle): Point2[] {
  const bounds = polygonBounds(object.polygon);
  const centers: Point2[] = [];
  const marginX = 0.2;
  const marginZ = 0.2;
  const step = Math.max(
    0.25,
    Math.min(0.75, Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 100),
  );
  const round = style === 'round6' || style === 'round8';
  const minX = Math.max(bounds.minX + marginX, origin[0] - 100);
  const maxX = Math.min(bounds.maxX - marginX, origin[0] + 100);
  const minZ = Math.max(bounds.minZ + marginZ, origin[1] - 100);
  const maxZ = Math.min(bounds.maxZ - marginZ, origin[1] + 100);
  const rowStep = round ? (step * Math.sqrt(3)) / 2 : step;
  let row = 0;
  for (let z = minZ; z <= maxZ; z += rowStep, row += 1) {
    const offset = round && row % 2 === 1 ? step / 2 : 0;
    for (let x = minX + offset; x <= maxX; x += step) {
      const point: Point2 = [x, z];
      if (pointInPolygon(point, object.polygon)) {
        centers.push(point);
      }
    }
  }
  return centers.sort(
    (a, b) =>
      Math.hypot(a[0] - origin[0], a[1] - origin[1]) -
      Math.hypot(b[0] - origin[0], b[1] - origin[1]),
  );
}

function addProp(
  props: DiningPropPlacement[],
  kind: DiningPropKind,
  center: Point2,
  size: number,
  collidable = true,
) {
  props.push({
    id: `${kind}-${props.length + 1}`,
    kind,
    center,
    yawRadians: 0,
    footprint: rect(center, size, size),
    collidable,
  });
}

function diningEntryEdge(object: PlanObject, origin: Point2): number {
  const selected = object.diningEntranceEdge ?? object.diningVendorServiceEdge;
  if (selected !== undefined && selected >= 0 && selected < object.polygon.length) {
    return selected;
  }
  let best = 0;
  let score = -Infinity;
  object.polygon.forEach((point, index) => {
    const next = object.polygon[(index + 1) % object.polygon.length]!;
    const middle: Point2 = [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2];
    const distance = Math.hypot(middle[0] - origin[0], middle[1] - origin[1]);
    const length = Math.hypot(next[0] - point[0], next[1] - point[1]);
    const candidate = (1 / length) * 1000 + distance;
    if (candidate > score) {
      best = index;
      score = candidate;
    }
  });
  return best;
}

/**
 * Emit durable, deterministic furniture placements from an authored polygon.
 * Furniture stays at real-world dimensions; a resized polygon changes fit/capacity, never scale.
 */
export function diningLayout(object: PlanObject): DiningLayout {
  const style = styleFor(object);
  const origin = centroid(object.polygon);
  const rng = seededRandom(object.diningSeed ?? 42);
  const occupancy = object.diningOccupancy ?? 0;
  const chairStyle =
    object.diningChairStyle ??
    (style === 'rows-banquet'
      ? 'banquet-padded'
      : style === 'cafe-bistro'
        ? 'wooden-cafe'
        : 'plastic-stackable');
  const centerpiece = object.diningCenterpiece ?? 'none';
  const wanted = Math.max(1, Math.floor(object.diningTableCount ?? 6));
  const seatsPerTable = requestedSeats(style);
  const requestedCapacity = wanted * seatsPerTable;
  const centers = candidateCenters(object, origin, style);
  const tables: DiningTablePlacement[] = [];
  const warnings: string[] = [];
  const [width, depth, height] =
    style === 'cafe-bistro'
      ? [0.75, 0.75, 1.05]
      : style === 'communal-long' || style === 'rows-banquet'
        ? [2.8, 0.9, 0.75]
        : [DINING_DEFAULTS.table.width, DINING_DEFAULTS.table.depth, DINING_DEFAULTS.table.height];
  const entryEdge = diningEntryEdge(object, origin);
  const edgeStart = object.polygon[entryEdge]!;
  const edgeEnd = object.polygon[(entryEdge + 1) % object.polygon.length]!;
  const edgeMid: Point2 = [(edgeStart[0] + edgeEnd[0]) / 2, (edgeStart[1] + edgeEnd[1]) / 2];
  const entryVector: Point2 = [origin[0] - edgeMid[0], origin[1] - edgeMid[1]];
  const entryLength = Math.hypot(entryVector[0], entryVector[1]) || 1;
  const entryDirection: Point2 = [entryVector[0] / entryLength, entryVector[1] / entryLength];
  const aisleStart: Point2 = [
    edgeMid[0] + entryDirection[0] * 0.02,
    edgeMid[1] + entryDirection[1] * 0.02,
  ];
  const aisleEnd: Point2 = [
    origin[0] - entryDirection[0] * 0.7,
    origin[1] - entryDirection[1] * 0.7,
  ];
  const aisleAngle = Math.atan2(aisleEnd[1] - aisleStart[1], aisleEnd[0] - aisleStart[0]);
  const aisleLength = Math.hypot(aisleEnd[0] - aisleStart[0], aisleEnd[1] - aisleStart[1]);
  const aisleCenter: Point2 = [
    (aisleStart[0] + aisleEnd[0]) / 2,
    (aisleStart[1] + aisleEnd[1]) / 2,
  ];
  const aislePolygon = rect(
    aisleCenter,
    DINING_DEFAULTS.mainAisle,
    Math.max(0.1, aisleLength),
    yawFromForwardAngle(aisleAngle),
  );
  const aisles: DiningAisle[] = [];
  if (polygonContains(object.polygon, aislePolygon)) {
    aisles.push({
      id: 'main-entry-aisle',
      centerline: [aisleStart, aisleEnd],
      width: DINING_DEFAULTS.mainAisle,
      polygon: aislePolygon,
    });
  } else {
    warnings.push(
      'A 2 m route from the selected entry edge to the dining area does not fit; no tables are placed until it does.',
    );
  }

  const reservedChairSets: DiningChairPlacement[][] = [];
  for (const center of centers) {
    if (!aisles.length) {
      break;
    }
    if (tables.length >= wanted) {
      break;
    }
    const round = style === 'round6' || style === 'round8';
    const tableFootprint = round ? circle(center, 0.62) : rect(center, width, depth);
    const rawSeats = chairSeats(center, width, depth, style);
    const chairs: DiningChairPlacement[] = [];
    const reservedChairs: DiningChairPlacement[] = [];
    rawSeats.forEach((seat, index) => {
      const radialJitter = (rng() - 0.5) * 0.08;
      const angularJitter = ((rng() - 0.5) * 10 * Math.PI) / 180;
      const jittered = vector(seat.center, radialJitter, seat.facing);
      const occupied = rng() < occupancy;
      const id = `table-${tables.length + 1}-seat-${index + 1}`;
      const facingAngle = seat.facing + angularJitter;
      chairs.push(makeChair(id, jittered, facingAngle, occupied, chairStyle, center));
      // Reserve the worst-case occupied envelope so changing occupancy never rearranges tables.
      reservedChairs.push(makeChair(id, jittered, facingAngle, true, chairStyle, center));
    });
    const allFootprints = [
      tableFootprint,
      ...chairs.map((chair) => chair.footprint),
      ...reservedChairs.map((chair) => chair.blockerFootprint),
      ...reservedChairs.map((chair) => chair.seatApproach),
    ];
    // Polygon containment validates every actual rectangle, including concave edges.
    if (!allFootprints.every((footprint) => polygonContains(object.polygon, footprint))) {
      continue;
    }
    if (
      aisles.some((aisle) =>
        allFootprints.some((footprint) => polygonsOverlap(footprint, aisle.polygon)),
      )
    ) {
      continue;
    }
    if (
      tables.some((placed, placedIndex) => {
        const oldReservedChairs = reservedChairSets[placedIndex]!;
        const dx = placed.center[0] - center[0];
        const dz = placed.center[1] - center[1];
        if (
          polygonGap(tableFootprint, placed.footprint) < DINING_DEFAULTS.intertableAisle ||
          Math.hypot(dx, dz) < (width + placed.width) / 2 + DINING_DEFAULTS.intertableAisle
        ) {
          return true;
        }
        if (
          reservedChairs.some((chair) => polygonsOverlap(chair.blockerFootprint, placed.footprint))
        ) {
          return true;
        }
        if (
          oldReservedChairs.some((oldChair) =>
            polygonsOverlap(oldChair.blockerFootprint, tableFootprint),
          )
        ) {
          return true;
        }
        return reservedChairs.some((chair) =>
          oldReservedChairs.some(
            (oldChair) =>
              polygonGap(chair.blockerFootprint, oldChair.blockerFootprint) <
              DINING_DEFAULTS.occupiedBackClearance,
          ),
        );
      })
    ) {
      continue;
    }
    tables.push({
      id: `dining-table-${tables.length + 1}`,
      center,
      yawRadians: 0,
      width,
      depth,
      height,
      topShape: round ? 'round' : 'rectangular',
      footprint: tableFootprint,
      style,
      centerpiece,
      tablecloth: object.diningTablecloth ?? false,
      chairs,
    });
    reservedChairSets.push(reservedChairs);
  }

  if (tables.length < wanted) {
    warnings.push(
      `Requested ${wanted} tables (${requestedCapacity} seats), but only ${tables.length} tables fit with fixed-size furniture and boundary clearances.`,
    );
  }
  const props: DiningPropPlacement[] = [];
  if (object.diningShade === 'umbrella') {
    tables.forEach((table) => addProp(props, 'umbrella', table.center, 1.8, false));
  }
  if (object.diningShade === 'pergola' && tables.length) {
    const first = tables[0]!;
    for (const dx of [-2.4, 2.4]) {
      for (const dz of [-1.8, 1.8]) {
        addProp(props, 'pergola-post', [first.center[0] + dx, first.center[1] + dz], 0.16);
      }
    }
  }
  if (object.diningBoundary === 'planter' || object.diningBoundary === 'rope') {
    const kind = object.diningBoundary === 'planter' ? 'planter' : 'rope-post';
    const entryEdge = diningEntryEdge(object, origin);
    object.polygon.forEach((point, index) => {
      if (index === entryEdge) {
        return;
      }
      const next = object.polygon[(index + 1) % object.polygon.length]!;
      addProp(props, kind, [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2], 0.36);
    });
  }
  if (object.diningHost) {
    const hostEdge = diningEntryEdge(object, origin);
    const hostStart = object.polygon[hostEdge]!;
    const hostEnd = object.polygon[(hostEdge + 1) % object.polygon.length]!;
    const point: Point2 = [(hostStart[0] + hostEnd[0]) / 2, (hostStart[1] + hostEnd[1]) / 2];
    addProp(
      props,
      'host',
      [point[0] * 0.9 + origin[0] * 0.1, point[1] * 0.9 + origin[1] * 0.1],
      0.5,
    );
  }
  if (object.diningBusTub && tables[0]) {
    addProp(props, 'bus-tub', [tables[0].center[0] + 0.8, tables[0].center[1] + 0.8], 0.45);
  }

  const actualCapacity = tables.reduce((sum, table) => sum + table.chairs.length, 0);
  if (actualCapacity < requestedCapacity) {
    warnings.push(
      `Fitted capacity is ${actualCapacity} seats; requested capacity was ${requestedCapacity}.`,
    );
  }
  const seatedAvatars: DiningSeatedAvatar[] = tables.flatMap((table) =>
    table.chairs
      .filter((chair) => chair.occupied)
      .map((chair) => ({
        id: `seated-avatar:${chair.id}`,
        chairId: chair.id,
        position: chair.center,
        seatHeight: chair.seatHeight,
        yawRadians: chair.yawRadians,
        facingTarget: table.center,
      })),
  );
  return {
    origin,
    tables,
    aisles,
    props,
    seatedAvatars,
    capacity: actualCapacity,
    requestedCapacity,
    warnings,
  };
}

/** Return a navigation origin; hosts should pass the editor's real entrance anchor when available. */
export function diningAnchorPoint(
  object: PlanObject,
  kind: 'host' | 'seat',
  chairId?: string,
  entrance?: Point2,
): Point2 | null {
  const layout = diningLayout(object);
  if (kind === 'seat') {
    return (
      layout.tables.flatMap((table) => table.chairs).find((chair) => chair.id === chairId)
        ?.approachPoint ?? null
    );
  }
  if (entrance) {
    const dx = layout.origin[0] - entrance[0];
    const dz = layout.origin[1] - entrance[1];
    const length = Math.hypot(dx, dz) || 1;
    return [entrance[0] + (dx / length) * 0.4, entrance[1] + (dz / length) * 0.4];
  }
  return layout.props.find((prop) => prop.kind === 'host')?.center ?? null;
}

/** Four-metre inward service buffer attached to a persisted vendor link and selected polygon edge. */
export function diningVendorServiceWindow(object: PlanObject): DiningVendorServiceWindow | null {
  const referenceId = object.diningVendorReferenceId;
  const edgeIndex = object.diningVendorServiceEdge;
  if (!referenceId || edgeIndex === undefined || edgeIndex >= object.polygon.length) {
    return null;
  }
  const start = object.polygon[edgeIndex]!;
  const end = object.polygon[(edgeIndex + 1) % object.polygon.length]!;
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.hypot(dx, dz) || 1;
  const normal: Point2 = [-dz / length, dx / length];
  const middle: Point2 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const towardCenter: Point2 = [
    centroid(object.polygon)[0] - middle[0],
    centroid(object.polygon)[1] - middle[1],
  ];
  const direction = normal[0] * towardCenter[0] + normal[1] * towardCenter[1] >= 0 ? 1 : -1;
  const inward: Point2 = [normal[0] * direction * 4, normal[1] * direction * 4];
  const polygon: Point2[] = [
    [start[0], start[1]],
    [end[0], end[1]],
    [end[0] + inward[0], end[1] + inward[1]],
    [start[0] + inward[0], start[1] + inward[1]],
  ];
  const interiorCheck: Point2[] = [
    [start[0] + inward[0] * 0.002, start[1] + inward[1] * 0.002],
    [end[0] + inward[0] * 0.002, end[1] + inward[1] * 0.002],
    [end[0] + inward[0] * 0.998, end[1] + inward[1] * 0.998],
    [start[0] + inward[0] * 0.998, start[1] + inward[1] * 0.998],
  ];
  return {
    referenceId,
    edgeIndex,
    clearBuffer: 4,
    polygon,
    fitsBoundary: polygonContains(object.polygon, interiorCheck),
  };
}
