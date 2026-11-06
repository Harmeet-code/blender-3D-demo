import { smoothRouteCorners } from '../walkthrough/steering/route-steering.ts';
import {
  pointInPolygon,
  polygonBounds,
} from '@/utils/geometry/polygon.ts';
import { bakeBooth, boothEdges, boothWorldPoints } from '../../model/booth.ts';
import { objectPoints } from '../../model/geometry.ts';
import { isBooth, isConnector, type PlanDocument, type PlanObject } from '../../model/types.ts';
import { exitSinkLocal } from '../../model/exit.ts';
import { kioskQueueEntryLocal } from '../../model/kiosk.ts';
import { washroomLandingLocal } from '../../model/washroom.ts';
import { infoCustomerNode } from '../../model/information.ts';
import { firstAidEntryLocal } from '../../model/firstaid.ts';
import { waterApproachNode } from '../../model/water.ts';
import { washRackApproachLocal } from '../../model/wash-rack-spatial.ts';
import { shippingSpatialLayout, shippingWorldPoint } from '../../model/shipping-spatial.ts';
import { parkingAnchorPoint } from '../../model/parking-navigation.ts';
import { diningAnchorPoint } from '../../model/dining-navigation.ts';
import { circulationEntry } from '../../model/circulation.ts';
import { type StudioNavigator, type PlanRoute } from '../../model/directions.ts';
import { CHARACTER_CONFIG } from '../walkthrough/character-config.ts';
import { validateCapsuleSweep, validateCapsuleEndpoint } from '../walkthrough/collision/capsule-clearance.ts';
import { ZONE_AREA } from './input-builder.ts';
import type { WalkableZone } from '../model/zone-schema.ts';
import type { Role } from '../walkthrough/contracts.ts';
import type { ConnectorRecord } from '../walkthrough/connectors/connector-runtime.ts';
import {
  createRoleNavigationZones,
  EMPTY_ROUTE_NAVIGATION_POLICY,
  roleMayUseRestrictedZones,
  routeNavigationPolicyKey,
  type RouteNavigationPolicySource,
} from '../walkthrough/permissions/route-navigation-policy.ts';
import {
  routeRequestSchema,
  routeResultSchema,
  type RouteRequest,
  type RouteResult,
  type RouteSegment,
} from '../model/route-schema.ts';
import { measuredSegments, segmentInstructions } from '../model/route-segments.ts';
import {
  connectorRecordSupportsNavigation,
  connectorTraversalPoints,
  createPlanningNavigationContext,
  NAV_AGENT_DIAMETER_M,
  NAV_AGENT_RADIUS_M,
  NAV_PLANNING_RADIUS_M,
  type PlanningNavigationContext,
} from './planning-context.ts';

export { NAV_AGENT_RADIUS_M } from './planning-context.ts';

export type Point2 = [number, number];

const ITEM_ACCESS_OFFSET_M = NAV_AGENT_RADIUS_M + 0.15;
const NAVIGATION_PROFILE = { ...CHARACTER_CONFIG, radiusM: NAV_AGENT_RADIUS_M };
const ROUTE_CURVE_SEGMENTS = 8;

export interface ResolvedEndpoint {
  floorId: string;
  point: Point2;
  snapped: boolean;
  label: string;
  warning?: string;
}

const authoredWalkableZones = (zones: WalkableZone[], floorId: string) =>
  zones.filter((zone) => zone.floorId === floorId && zone.type !== 'restricted');

const CLOSED_BOOTH_WARNING = 'This booth has no open edge. The route stops outside its wall.';
const BLOCKED_BOOTH_ENTRANCE_WARNING =
  'The booth entrance is blocked. The route stops at a clear exterior side instead.';

function appendWarnings(message: string, warnings: readonly (string | undefined)[]): string {
  return [...new Set(warnings.filter((warning): warning is string => !!warning))].reduce(
    (result, warning) => (result.includes(warning) ? result : `${result} ${warning}`),
    message,
  );
}

function endpointWarning(document: PlanDocument, endpoint: RouteRequest['start']): string | undefined {
  if (endpoint.kind !== 'item') {
    return undefined;
  }
  const object = document.floors
    .find((floor) => floor.source.id === endpoint.floorId)
    ?.objects.find((item) => item.id === endpoint.itemId);
  return object && isBooth(object) && boothEdges(bakeBooth(object)).every((edge) => edge.mode === 'wall')
    ? CLOSED_BOOTH_WARNING
    : undefined;
}

export function invalidConnectorLandings(
  document: PlanDocument,
  zones: WalkableZone[],
  allowRestricted = false,
  role: Role = 'visitor',
  planningContext?: PlanningNavigationContext,
): string[] {
  const planning = planningContext ?? createPlanningNavigationContext(document, zones, role);
  return planning.portals
    .filter((portal) => (portal.entries?.length ?? 0) >= 2)
    .filter((portal) =>
      portal.entries!.some((entry) => {
        const landing = resolveEndpoint(
          document,
          { floorId: entry.floorId, kind: 'point', point: entry.position },
          zones,
          undefined,
          allowRestricted,
          role,
          planning,
        );
        return 'error' in landing || landing.snapped;
      }),
    )
    .map((portal) => portal.id);
}

function boothEdgeAccessPoints(
  object: PlanObject,
  edges: ReturnType<typeof boothEdges>,
  from: Point2 | undefined,
  useFullEdge: boolean,
): Point2[] {
  const candidates = edges.flatMap((edge) => {
    const span = useFullEdge ? edge.length : Math.min(edge.length, edge.opening);
    const halfSpan = Math.max(0, span / 2 - ITEM_ACCESS_OFFSET_M);
    const offsets = halfSpan > 0.1 ? [0, -halfSpan * 0.8, halfSpan * 0.8] : [0];
    return boothWorldPoints(object, offsets.map((offset): Point2 => [
      (edge.a[0] + edge.b[0]) / 2 + edge.tangent[0] * offset - edge.inward[0] * ITEM_ACCESS_OFFSET_M,
      (edge.a[1] + edge.b[1]) / 2 + edge.tangent[1] * offset - edge.inward[1] * ITEM_ACCESS_OFFSET_M,
    ]));
  });
  if (from) {
    candidates.sort(
      (a, b) =>
        Math.hypot(a[0] - from[0], a[1] - from[1]) -
        Math.hypot(b[0] - from[0], b[1] - from[1]),
    );
  }
  return candidates;
}

function overlapWidth(a: readonly Point2[], b: readonly Point2[]): number {
  const points: Point2[] = [
    ...a.filter((point) => pointInPolygon(point, b)).map((point) => [...point] as Point2),
    ...b.filter((point) => pointInPolygon(point, a)).map((point) => [...point] as Point2),
  ];
  for (let ai = 0; ai < a.length; ai++) {
    const a0 = a[ai]!, a1 = a[(ai + 1) % a.length]!;
    for (let bi = 0; bi < b.length; bi++) {
      const b0 = b[bi]!, b1 = b[(bi + 1) % b.length]!;
      const arx = a1[0] - a0[0], arz = a1[1] - a0[1];
      const brx = b1[0] - b0[0], brz = b1[1] - b0[1];
      const denominator = arx * brz - arz * brx;
      if (Math.abs(denominator) <= 1e-9) {continue;}
      const dx = b0[0] - a0[0], dz = b0[1] - a0[1];
      const at = (dx * brz - dz * brx) / denominator;
      const bt = (dx * arz - dz * arx) / denominator;
      if (at >= -1e-9 && at <= 1 + 1e-9 && bt >= -1e-9 && bt <= 1 + 1e-9) {
        points.push([a0[0] + arx * at, a0[1] + arz * at]);
      }
    }
  }
  const unique = points
    .sort((left, right) => left[0] - right[0] || left[1] - right[1])
    .filter((point, index, sorted) =>
      !index || Math.hypot(point[0] - sorted[index - 1]![0], point[1] - sorted[index - 1]![1]) > 1e-7,
    );
  if (unique.length < 3) {return 0;}
  const cross = (origin: Point2, left: Point2, right: Point2) =>
    (left[0] - origin[0]) * (right[1] - origin[1]) -
    (left[1] - origin[1]) * (right[0] - origin[0]);
  const half = (input: Point2[]) => {
    const result: Point2[] = [];
    for (const point of input) {
      while (result.length >= 2 && cross(result.at(-2)!, result.at(-1)!, point) <= 1e-9) {
        result.pop();
      }
      result.push(point);
    }
    return result;
  };
  const hull = half(unique).slice(0, -1).concat(half([...unique].reverse()).slice(0, -1));
  let width = Infinity;
  for (let index = 0; index < hull.length; index++) {
    const from = hull[index]!, to = hull[(index + 1) % hull.length]!;
    const dx = to[0] - from[0], dz = to[1] - from[1], length = Math.hypot(dx, dz);
    if (length <= 1e-9) {continue;}
    const nx = -dz / length, nz = dx / length;
    const projections = hull.map((point) => point[0] * nx + point[1] * nz);
    width = Math.min(width, Math.max(...projections) - Math.min(...projections));
  }
  return Number.isFinite(width) ? width : 0;
}

function walkableConnectionFailure(
  zones: WalkableZone[],
  start: ResolvedEndpoint,
  dest: ResolvedEndpoint,
  allowRestricted: boolean,
): string | undefined {
  if (start.floorId !== dest.floorId) {return undefined;}
  const floorZones = zones.filter(
    (zone) =>
      zone.floorId === start.floorId &&
      (allowRestricted || zone.type !== 'restricted'),
  );
  const startZones = floorZones
    .map((zone, index) => pointInPolygon(start.point, zone.polygon) ? index : -1)
    .filter((index) => index >= 0);
  const destinationZones = new Set(
    floorZones
      .map((zone, index) => pointInPolygon(dest.point, zone.polygon) ? index : -1)
      .filter((index) => index >= 0),
  );
  if (!startZones.length || !destinationZones.size) {return undefined;}
  const widths = floorZones.map(() => floorZones.map(() => 0));
  for (let left = 0; left < floorZones.length; left++) {
    for (let right = left + 1; right < floorZones.length; right++) {
      widths[left]![right] = widths[right]![left] = overlapWidth(
        floorZones[left]!.polygon,
        floorZones[right]!.polygon,
      );
    }
  }
  const capacity = floorZones.map(() => -Infinity);
  const parent = floorZones.map(() => -1);
  const visited = new Set<number>();
  for (const index of startZones) {capacity[index] = Infinity;}
  for (let count = 0; count < floorZones.length; count++) {
    let current = -1;
    for (let index = 0; index < floorZones.length; index++) {
      if (!visited.has(index) && (current < 0 || capacity[index]! > capacity[current]!)) {
        current = index;
      }
    }
    if (current < 0 || capacity[current] === -Infinity) {break;}
    visited.add(current);
    for (let next = 0; next < floorZones.length; next++) {
      if (widths[current]![next]! <= 0) {continue;}
      const candidate = Math.min(capacity[current]!, widths[current]![next]!);
      if (candidate > capacity[next]!) {
        capacity[next] = candidate;
        parent[next] = current;
      }
    }
  }
  const target = [...destinationZones].sort((left, right) => capacity[right]! - capacity[left]!)[0]!;
  if (capacity[target] === -Infinity) {
    return 'The start and destination are in disconnected authored walkable-zone groups. Extend a walkable zone so the groups overlap.';
  }
  if (capacity[target]! >= NAV_AGENT_DIAMETER_M) {return undefined;}
  let current = target;
  let narrowest: { left: number; right: number; width: number } | undefined;
  while ((parent[current] ?? -1) >= 0) {
    const previous = parent[current]!;
    const width = widths[previous]![current]!;
    if (!narrowest || width < narrowest.width) {
      narrowest = { left: previous, right: current, width };
    }
    current = previous;
  }
  if (!narrowest) {return undefined;}
  const left = floorZones[narrowest.left]!, right = floorZones[narrowest.right]!;
  const label = (zone: WalkableZone) => `"${zone.name}" (${zone.id})`;
  return `The walkable overlap between ${label(left)} and ${label(right)} is only about ${narrowest.width.toFixed(2)} m wide. The route capsule needs at least ${NAV_AGENT_DIAMETER_M.toFixed(2)} m; extend either zone so their overlap is at least ${(NAV_PLANNING_RADIUS_M * 2).toFixed(2)} m for reliable routing.`;
}

/** Semantic item access candidates in world coordinates, never the item centre. */
function itemAccessPoints(object: PlanObject, from?: Point2): Point2[] {
  const local = (point: Point2): Point2 => objectPoints(object, [point])[0]!;
  if (isBooth(object)) {
    const baked = bakeBooth(object);
    const edges = boothEdges(baked).filter((edge) => edge.mode !== 'wall');
    // A clear part of an opening may remain reachable when its midpoint is
    // blocked or outside the authored aisle. Stay inside the real opening,
    // with capsule clearance from its jambs, instead of snapping to any zone.
    return boothEdgeAccessPoints(baked, edges.length ? edges : boothEdges(baked), from, false);
  }
  switch (object.recipe) {
    case 'exit':
      return [local(exitSinkLocal())];
    case 'food-kiosk':
      return [local(kioskQueueEntryLocal(object))];
    case 'washroom-men':
    case 'washroom-women':
      return [local(washroomLandingLocal(object))];
    case 'information':
      return [local(infoCustomerNode(object))];
    case 'first-aid':
      return [local(firstAidEntryLocal(object))];
    case 'water':
      return [local(waterApproachNode())];
    case 'wash-rack': {
      const bounds = polygonBounds(washRackApproachLocal(object));
      return [local([(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2])];
    }
    case 'shipping':
      // Route on the supported ground XZ plane to the stair foot; the deck is elevated.
      return [shippingWorldPoint(object, shippingSpatialLayout(object).pedestrianApproachAnchor)];
    case 'parking-lot':
      return [parkingAnchorPoint(object, 'pedestrian-exit') ?? local([0, 0])];
    case 'dining':
      return [
        diningAnchorPoint(object, object.diningHost ? 'host' : 'seat', undefined, from) ??
          local([0, 0])
      ];
    case 'entrance':
      return [local([0, object.dimensions[2] / 2 + ITEM_ACCESS_OFFSET_M])];
    default: {
      if (object.circulationDesign) {
        return [circulationEntry(object)];
      }
      return [local([0, Math.max(...object.polygon.map(([, z]) => z)) + ITEM_ACCESS_OFFSET_M])];
    }
  }
}

/** Backwards-compatible singular accessor; route planning evaluates every booth candidate. */
export function itemAccessPoint(object: PlanObject, from?: Point2): Point2 {
  return itemAccessPoints(object, from)[0]!;
}

function resolveEndpointCandidates(
  document: PlanDocument,
  endpoint: RouteRequest['start'],
  zones: WalkableZone[],
  from?: Point2,
  role: Role = 'visitor',
  planningContext?: PlanningNavigationContext,
): { candidates: ResolvedEndpoint[] } | { error: string } {
  const floor = document.floors.find((item) => item.source.id === endpoint.floorId);
  if (!floor) {
    return { error: 'Unknown floor.' };
  }
  let points: Point2[];
  let endpointObject: PlanObject | undefined;
  let label: string;
  let warning: string | undefined;
  let accessDescription = 'access point';
  if (endpoint.kind === 'item') {
    const object = floor.objects.find((item) => item.id === endpoint.itemId);
    if (!object) {
      return { error: 'Item no longer exists.' };
    }
    endpointObject = object;
    points = itemAccessPoints(object, from);
    label = object.name;
    if (isBooth(object) && boothEdges(bakeBooth(object)).every((edge) => edge.mode === 'wall')) {
      warning = CLOSED_BOOTH_WARNING;
      accessDescription = 'outside-wall access point';
    } else if (isBooth(object)) {
      accessDescription = 'open-side access point';
    }
  } else {
    const point = [...(endpoint.point ?? [0, 0])] as Point2;
    points = [point];
    label = `Point (${point[0].toFixed(1)}, ${point[1].toFixed(1)})`;
  }
  const walkable = authoredWalkableZones(zones, floor.source.id);
  if (!walkable.length) {
    return {
      error: appendWarnings('Draw a walkable zone on this floor before planning a route.', [warning]),
    };
  }
  const planning = planningContext ?? createPlanningNavigationContext(document, zones, role);
  const input = planning.floorInputs.get(floor.source.id);
  const collisionMap = planning.collisionMaps.get(floor.source.id);
  if (!input || !collisionMap) {
    return { error: appendWarnings('Route clearance geometry is unavailable for this floor.', [warning]) };
  }
  let insideAuthoredRegion = false;
  let clearanceReason: string | undefined;
  const candidates: ResolvedEndpoint[] = [];
  const evaluate = (candidatePoints: Point2[], candidateWarning: string | undefined, snapped: boolean) => {
    for (const point of candidatePoints) {
      const insideWalkable = input.surfaces.some((surface) => pointInPolygon(point, surface));
      if (!insideWalkable) {
        continue;
      }
      insideAuthoredRegion = true;
      const physicalEndpoint = validateCapsuleEndpoint(
        collisionMap,
        role,
        [point[0], floor.source.heightOffset, point[1]],
        NAVIGATION_PROFILE,
      );
      if (physicalEndpoint.clear) {
        candidates.push({
          floorId: floor.source.id,
          point,
          snapped,
          label,
          warning: candidateWarning,
        });
        continue;
      }
      const blockerId = physicalEndpoint.blockerId;
      const blockerObject = blockerId
        ? floor.objects.find((object) => object.id === blockerId.replace(/:\d+$/, ''))
        : undefined;
      const reason = blockerObject && blockerId
        ? `Capsule sweep intersects ${blockerObject.name} (${blockerId}).`
        : physicalEndpoint.reason ?? 'insufficient-capsule-clearance';
      clearanceReason ??= reason;
    }
  };
  evaluate(points, warning, false);
  if (
    candidates.length === 0 &&
    endpointObject &&
    isBooth(endpointObject) &&
    boothEdges(bakeBooth(endpointObject)).some((edge) => edge.mode !== 'wall')
  ) {
    const baked = bakeBooth(endpointObject);
    const fallbackWarning = appendWarnings(BLOCKED_BOOTH_ENTRANCE_WARNING, [warning]);
    for (const edge of boothEdges(baked).filter((candidate) => candidate.mode === 'wall')) {
      for (const point of boothEdgeAccessPoints(baked, [edge], from, true)) {
        const acceptedBefore = candidates.length;
        evaluate([point], fallbackWarning, true);
        if (candidates.length > acceptedBefore) {
          break;
        }
      }
    }
  }
  if (candidates.length) {
    return { candidates };
  }
  if (!insideAuthoredRegion) {
    return endpoint.kind === 'item'
      ? { error: appendWarnings(`Extend a walkable zone to include ${label}'s exact ${accessDescription}.`, [warning]) }
      : { error: appendWarnings(`${label} is outside the authored walkable region. Extend a walkable zone to include this exact point.`, [warning]) };
  }
  const clearanceGuidance = clearanceReason
    ? ` ${clearanceReason} Clear the approach or extend the walkable zone around it.`
    : ' Choose a clear, supported location or extend the supporting zone.';
  return endpoint.kind === 'item'
    ? {
        error: appendWarnings(`${label}'s exact ${accessDescription} does not have ${NAV_AGENT_RADIUS_M.toFixed(1)} m route clearance.${clearanceGuidance}`, [warning]),
      }
    : {
        error: appendWarnings(`${label} does not have ${NAV_AGENT_RADIUS_M.toFixed(1)} m route clearance.${clearanceGuidance}`, [warning]),
      };
}

export function resolveEndpoint(
  document: PlanDocument,
  endpoint: RouteRequest['start'],
  zones: WalkableZone[],
  from?: Point2,
  _allowRestricted = false,
  role: Role = 'visitor',
  planningContext?: PlanningNavigationContext,
): ResolvedEndpoint | { error: string } {
  const planning = planningContext ?? createPlanningNavigationContext(document, zones, role);
  const resolved = resolveEndpointCandidates(document, endpoint, zones, from, role, planning);
  return 'error' in resolved ? resolved : resolved.candidates[0]!;
}

const WALK_M_S = 1.2;

function bearingName(angle: number): 'left' | 'right' | 'straight' {
  if (Math.abs(angle) < 0.35) {
    return 'straight';
  }
  return angle > 0 ? 'right' : 'left';
}

function nearestItemName(objects: PlanObject[], point: Point2): string | null {
  let best: string | null = null;
  let nearest = 4;
  for (const object of objects) {
    const distance = Math.hypot(object.position[0] - point[0], object.position[1] - point[1]);
    if (distance < nearest) {
      nearest = distance;
      best = object.name;
    }
  }
  return best;
}

export function describeRoute(
  route: PlanRoute,
  document: PlanDocument,
  destLabel: string,
): { instructions: string[]; lengthM: number; secondsEta: number } {
  const instructions: string[] = [];
  const lengthM = route.distance;
  for (const segment of route.segments) {
    const floor = document.floors.find((item) => item.source.id === segment.floorId);
    const { points } = segment;
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const c = points[i + 1]!;
      const inAngle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const outAngle = Math.atan2(c[1] - b[1], c[0] - b[0]);
      let turn = outAngle - inAngle;
      while (turn > Math.PI) {
        turn -= Math.PI * 2;
      }
      while (turn < -Math.PI) {
        turn += Math.PI * 2;
      }
      const bearing = bearingName(turn);
      if (bearing === 'straight') {
        continue;
      }
      const landmark = floor ? nearestItemName(floor.objects, b) : null;
      const leg = Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(0);
      if (leg === '0') {
        continue;
      }
      instructions.push(`Walk ${leg} m, turn ${bearing}${landmark ? ` at ${landmark}` : ''}.`);
      if (instructions.length >= 12) {
        break;
      }
    }
  }
  if (!instructions.length) {
    instructions.push(`Walk ${lengthM.toFixed(0)} m to ${destLabel}.`);
  } else {
    instructions.push(`Arrive at ${destLabel}.`);
  }
  return { instructions, lengthM, secondsEta: lengthM / WALK_M_S };
}

// Planner-owned metadata survives schema parsing by being pinned at playback begin.
const routeDestinations = new WeakMap<RouteResult, RouteRequest['dest']>();
export function destinationForRoute(route: RouteResult): RouteRequest['dest'] | undefined {
  const destination = routeDestinations.get(route);
  return destination ? structuredClone(destination) : undefined;
}

export interface RouteOutcome {
  request: RouteRequest;
  options: { shortest?: RouteResult; accessible?: RouteResult };
  failure?: string;
  failures?: Partial<Record<'shortest' | 'accessible', string>>;
  buildMs?: number;
}

interface CachedRoutePlanning {
  roleNavigation: ReturnType<typeof createRoleNavigationZones>;
  contexts: Partial<Record<'shortest' | 'accessible', PlanningNavigationContext>>;
}

const routePlanningCache = new WeakMap<
  PlanDocument,
  WeakMap<WalkableZone[], Map<string, CachedRoutePlanning>>
>();

function getCachedRoutePlanning(
  document: PlanDocument,
  zones: WalkableZone[],
  role: Role,
  rolePolicy: RouteNavigationPolicySource,
): CachedRoutePlanning {
  let byZones = routePlanningCache.get(document);
  if (!byZones) {
    byZones = new WeakMap();
    routePlanningCache.set(document, byZones);
  }
  let byRole = byZones.get(zones);
  if (!byRole) {
    byRole = new Map();
    byZones.set(zones, byRole);
  }
  const key = `${role}:${routeNavigationPolicyKey(rolePolicy)}`;
  let cached = byRole.get(key);
  if (!cached) {
    cached = {
      roleNavigation: createRoleNavigationZones(document, zones, role, rolePolicy),
      contexts: {},
    };
    byRole.set(key, cached);
  }
  return cached;
}

const connectorPointDistance = (
  point: readonly [number, number, number],
  other: readonly [number, number, number],
) => Math.hypot(point[0] - other[0], point[1] - other[1], point[2] - other[2]);

function connectorPathLength(points: readonly (readonly [number, number, number])[]): number {
  return points.reduce(
    (sum, point, index) =>
      sum + (index ? connectorPointDistance(points[index - 1]!, point) : 0),
    0,
  );
}

function connectorSeconds(record: ConnectorRecord, lengthM: number): number {
  if (record.kind === 'elevator') {
    return record.transferSeconds!;
  }
  const fallback = record.kind === 'stairs' ? 0.6 : record.kind === 'ramp' ? 0.8 : 0.5;
  return lengthM / (record.speedMps ?? fallback) + (record.transferSeconds ?? 0);
}

function bindPhysicalConnectors(
  segments: RouteSegment[],
  document: PlanDocument,
  planning: PlanningNavigationContext,
  role: Role,
  accessibleOnly: boolean,
): { segments?: RouteSegment[]; failure?: string } {
  const result: RouteSegment[] = [];
  for (const segment of segments) {
    if (!segment.toFloorId) {
      result.push(segment);
      continue;
    }
    const toFloorId = segment.toFloorId;
    const fromPoint = segment.points[0];
    const toPoint = segment.points.at(-1);
    if (!fromPoint || !toPoint) {
      return { failure: 'The selected connector has no authored transition endpoints.' };
    }
    const candidates = planning.eligibleConnectorRecords
      .filter((record) =>
        connectorRecordSupportsNavigation(
          record,
          role,
          accessibleOnly,
          segment.floorId,
          toFloorId,
        ),
      )
      .flatMap((record) => {
        const portal = planning.portals.find((item) => item.id === record.portalId);
        const fromEntry = portal?.entries?.find((entry) => entry.floorId === segment.floorId);
        const toEntry = portal?.entries?.find((entry) => entry.floorId === toFloorId);
        const fromStop = record.stops.find((stop) => stop.floorId === segment.floorId);
        const toStop = record.stops.find((stop) => stop.floorId === toFloorId);
        const points = connectorTraversalPoints(record, segment.floorId, toFloorId);
        const sourceObject = document.floors
          .find((floor) => floor.source.id === segment.floorId)
          ?.objects.find(
            (object) => object.portalId === record.portalId && isConnector(object.recipe),
          );
        if (!fromEntry || !toEntry || !fromStop || !toStop || !points || !sourceObject) {
          return [];
        }
        const fromEntryError = Math.hypot(
          fromEntry.position[0] - fromPoint[0],
          fromEntry.position[1] - fromPoint[2],
        );
        const toEntryError = Math.hypot(
          toEntry.position[0] - toPoint[0],
          toEntry.position[1] - toPoint[2],
        );
        const fromStopError = connectorPointDistance(fromStop.entry, fromPoint);
        const toStopError = connectorPointDistance(toStop.entry, toPoint);
        return Math.max(fromEntryError, toEntryError, fromStopError, toStopError) <= 0.75
          ? [{
              record,
              points,
              sourceObjectId: sourceObject.id,
              score: fromEntryError + toEntryError + fromStopError + toStopError,
            }]
          : [];
      })
      .sort((left, right) => left.score - right.score);
    const portalIds = new Set(candidates.map(({ record }) => record.portalId));
    if (!candidates.length || portalIds.size !== 1) {
      return {
        failure: candidates.length
          ? 'The selected portal is ambiguous between physical connector records.'
          : `No enabled ${accessibleOnly ? 'step-free ' : ''}physical connector with 0.8 m clear width binds ${segment.floorId} to ${toFloorId}.`,
      };
    }
    const binding = candidates[0]!;
    const lengthM = connectorPathLength(binding.points);
    result.push({
      ...segment,
      kind: binding.record.kind,
      // compilePath resolves this ID on the transition's source floor, then binds
      // both ascent and descent to the portal's authored lower flight.
      connectorId: binding.sourceObjectId,
      points: binding.points.map((point): [number, number, number] => [...point]),
      lengthM,
      seconds: connectorSeconds(binding.record, lengthM),
    });
  }
  return { segments: result };
}

function portalsWithoutPhysicalConnector(
  planning: PlanningNavigationContext,
): string[] {
  const eligible = new Set(planning.eligibleConnectorRecords.map((record) => record.portalId));
  return planning.portals
    .filter((portal) => {
      const floors = new Set((portal.entries ?? []).map((entry) => entry.floorId));
      return floors.size >= 2 && !eligible.has(portal.id);
    })
    .map((portal) => portal.id);
}

export async function planWayfindingRoute(
  navigator: StudioNavigator,
  document: PlanDocument,
  zones: WalkableZone[],
  request: RouteRequest,
  signal: AbortSignal,
  role: Role = 'visitor',
  rolePolicy: RouteNavigationPolicySource = EMPTY_ROUTE_NAVIGATION_POLICY,
  recoveryPass = 0,
): Promise<RouteOutcome> {
  const valid = routeRequestSchema.safeParse(request);
  if (!valid.success) {
    return { request, options: {}, failure: 'Invalid route endpoints.' };
  }
  const requestWarnings = [
    endpointWarning(document, request.start),
    endpointWarning(document, request.dest),
  ];
  if (signal.aborted) {
    throw new DOMException('Route cancelled', 'AbortError');
  }
  const cachedPlanning = getCachedRoutePlanning(document, zones, role, rolePolicy);
  const roleNavigation = cachedPlanning.roleNavigation;
  if (roleNavigation.error) {
    return { request, options: {}, failure: appendWarnings(roleNavigation.error, requestWarnings) };
  }
  const navigationDocument = roleNavigation.document;
  const navigationZones = roleNavigation.zones;
  const canUseRestricted = roleMayUseRestrictedZones(role);
  const requestedOption = request.accessibleOnly ? 'accessible' : 'shortest';
  const missingZoneFloor = [request.start.floorId, request.dest.floorId].find(
    (floorId) => !authoredWalkableZones(navigationZones, floorId).length,
  );
  if (missingZoneFloor) {
    return {
      request,
      options: {},
      failure: appendWarnings(
        `Draw a walkable zone on ${navigationDocument.floors.find((floor) => floor.source.id === missingZoneFloor)?.source.name ?? 'each route floor'} before testing routes.`,
        requestWarnings,
      ),
    };
  }
  const planning = cachedPlanning.contexts[requestedOption] ??= createPlanningNavigationContext(
    navigationDocument,
    navigationZones,
    role,
    requestedOption === 'accessible',
  );
  const starts = resolveEndpointCandidates(
    navigationDocument,
    request.start,
    navigationZones,
    undefined,
    role,
    planning,
  );
  if ('error' in starts) {
    return {
      request,
      options: {},
      failure: appendWarnings(`Start: ${starts.error}`, requestWarnings),
    };
  }
  const endpointPairs: Array<{ start: ResolvedEndpoint; dest: ResolvedEndpoint }> = [];
  let destinationError: string | undefined;
  const pairKeys = new Set<string>();
  for (const start of starts.candidates) {
    const destinations = resolveEndpointCandidates(
      navigationDocument,
      request.dest,
      navigationZones,
      start.point,
      role,
      planning,
    );
    if ('error' in destinations) {
      destinationError ??= destinations.error;
      continue;
    }
    for (const dest of destinations.candidates) {
      const key = JSON.stringify([start.floorId, start.point, dest.floorId, dest.point]);
      if (!pairKeys.has(key)) {
        pairKeys.add(key);
        endpointPairs.push({ start, dest });
      }
    }
  }
  if (!endpointPairs.length) {
    return {
      request,
      options: {},
      failure: appendWarnings(
        `Destination: ${destinationError ?? 'No exact access point is available.'}`,
        requestWarnings,
      ),
    };
  }
  const alreadyThere = endpointPairs.find(
    ({ start, dest }) =>
      start.floorId === dest.floorId &&
      Math.hypot(start.point[0] - dest.point[0], start.point[1] - dest.point[1]) < 1e-4,
  );
  if (alreadyThere) {
    const { start, dest } = alreadyThere;
    const y =
      navigationDocument.floors.find((floor) => floor.source.id === start.floorId)?.source.heightOffset ?? 0;
    const result: RouteResult = {
      waypoints: [
        [start.point[0], y, start.point[1]],
        [dest.point[0], y, dest.point[1]],
      ],
      segments: [
        {
          kind: 'walk',
          floorId: start.floorId,
          points: [
            [start.point[0], y, start.point[1]],
            [dest.point[0], y, dest.point[1]],
          ],
          lengthM: 0,
          seconds: 0,
        },
      ],
      lengthM: 0,
      secondsEta: 0,
      instructions: ['You are already here.'],
      option: requestedOption,
      snapped: { start: start.snapped, dest: dest.snapped },
      warnings: [
        start.warning,
        dest.warning,
        ...(request.allowRestricted && role !== 'staff'
          ? ['Restricted-zone access was ignored for the visitor role.']
          : []),
      ].filter((warning): warning is string => !!warning),
    };
    routeDestinations.set(result, structuredClone(request.dest));
    const options: RouteOutcome['options'] = {};
    options[requestedOption] = result;
    return { request, options };
  }
  const rejected = new Map<string, { floorId: string; polygon: Point2[] }>();
  const invalidLandings = invalidConnectorLandings(
    navigationDocument,
    navigationZones,
    canUseRestricted,
    role,
    planning,
  );
  const disabledPortals = new Set([
    ...invalidLandings,
    ...portalsWithoutPhysicalConnector(planning),
  ]);
  const queryFilter = {
    includeFlags: 0xffff,
    excludeFlags: canUseRestricted ? 0 : ZONE_AREA.restricted.flags,
    areaCosts: [[ZONE_AREA['queue-area'].area, 3]] as (readonly [number, number])[],
    agentRadiusM: NAV_PLANNING_RADIUS_M,
  };
  const runOption = async (
    option: 'shortest' | 'accessible',
    start: ResolvedEndpoint,
    dest: ResolvedEndpoint,
  ): Promise<{ result?: RouteResult; failure?: string; buildMs?: number }> => {
    const accessible = option === 'accessible';
    let route: PlanRoute;
    try {
      route = await navigator.plan(
        navigationDocument,
        { floorId: start.floorId, point: start.point },
        { floorId: dest.floorId, point: dest.point },
        signal,
        {
          queryFilter,
          disabledPortals: [...disabledPortals],

          straight: true,
          role,
          planningContext: planning,
        },
      );
    } catch (error) {
      const message = String(error);
      const connectionFailure = /No walkable Recast route/i.test(message)
        ? walkableConnectionFailure(navigationZones, start, dest, canUseRestricted)
        : undefined;
      return {
        failure: appendWarnings(
          connectionFailure ?? explainFailure(message, accessible),
          [start.warning, dest.warning],
        ),
      };
    }
    const firstWalk = route.segments.find((segment) => segment.floorId === start.floorId);
    const lastWalk = [...route.segments]
      .reverse()
      .find((segment) => segment.floorId === dest.floorId);
    if (
      !firstWalk?.points.length ||
      !lastWalk?.points.length ||
      Math.hypot(
        firstWalk.points[0]![0] - start.point[0],
        firstWalk.points[0]![1] - start.point[1],
      ) > 0.55 ||
      Math.hypot(
        lastWalk.points.at(-1)![0] - dest.point[0],
        lastWalk.points.at(-1)![1] - dest.point[1],
      ) > 0.55
    ) {
      return {
        failure: appendWarnings('A route endpoint does not have enough walkable clearance.', [
          start.warning,
          dest.warning,
        ]),
      };
    }
    const floorY = (floorId: string) =>
      navigationDocument.floors.find((floor) => floor.source.id === floorId)?.source.heightOffset ?? 0;
    let segments = measuredSegments(
      route,
      navigationDocument,
      [start.point[0], floorY(start.floorId), start.point[1]],
      [dest.point[0], floorY(dest.floorId), dest.point[1]],
    );
    // Validate the actual polyline selected by measuredSegments (which prefers
    // worker straight output), on every floor, before exposing a Start option.
    let preparationFailure: string | undefined;
    let clearanceFailure: {
      floorId: string;
      from: [number, number, number];
      to: [number, number, number];
      reason?: string;
      blockerId?: string;
    } | undefined;
    const prepare = (candidate: typeof segments): typeof segments | null => {
      const bound = bindPhysicalConnectors(
        candidate,
        navigationDocument,
        planning,
        role,
        accessible,
      );
      if (!bound.segments) {
        preparationFailure ??= bound.failure;
        return null;
      }
      const prepared: typeof segments = [];
      for (const segment of bound.segments) {
        if (segment.kind !== 'walk') {prepared.push(segment); continue;}
        if (segment.toFloorId) {return null;}
        const map = planning.collisionMaps.get(segment.floorId);
        if (!map) {return null;}
        const rounded = smoothRouteCorners(segment.points, {
          capsuleRadiusM: NAV_AGENT_RADIUS_M, curveSegments: ROUTE_CURVE_SEGMENTS,
          validateSegment: (a, b) => {
            const result = validateCapsuleSweep(map, role, a, b, NAVIGATION_PROFILE);
            if (!result.clear) {
              clearanceFailure ??= {
                floorId: segment.floorId,
                from: [...a],
                to: [...b],
                reason: result.reason,
                blockerId: result.blockerId,
              };
            }
            if (!result.clear && result.blockerId) {
              const obstacle = [...map.obstacles, ...map.blockedAreas].find((item) => item.id === result.blockerId);
              if (obstacle) {
                // Conservative box avoids repeating a failing grazing corridor.
                // Recast applies the explicit navigation radius around this barrier.
                const xs = obstacle.polygon.map(([x]) => x), zs = obstacle.polygon.map(([, z]) => z);
                const margin = 0.1 * (recoveryPass + 1);
                const x0 = Math.min(...xs) - margin, x1 = Math.max(...xs) + margin;
                const z0 = Math.min(...zs) - margin, z1 = Math.max(...zs) + margin;
                rejected.set(`${segment.floorId}:${obstacle.id}`, { floorId: segment.floorId,
                  polygon: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] });
              }
            }
            return result.clear;
          },
        });
        if (!rounded) {return null;}
        prepared.push({ ...segment, points: rounded.points, lengthM: rounded.length, seconds: rounded.length / WALK_M_S });
      }
      return prepared;
    };
    // A worker's straight representation is optional. Recover once using its
    // original corridor polyline; never accept a chord simply to shorten a route.
    const prepared = prepare(segments) ?? prepare(measuredSegments(
      { ...route, straight: undefined }, navigationDocument,
      [start.point[0], floorY(start.floorId), start.point[1]],
      [dest.point[0], floorY(dest.floorId), dest.point[1]],
    ));
    if (!prepared) {
      const clearanceMessage = (() => {
        if (!clearanceFailure) {
          return undefined;
        }
        const floor = navigationDocument.floors.find(
          (candidate) => candidate.source.id === clearanceFailure!.floorId,
        );
        const objectId = clearanceFailure.blockerId?.replace(/:\d+$/, '');
        const blocker = floor?.objects.find((object) => object.id === objectId);
        const blockerLabel = blocker
          ? `${blocker.name} (${clearanceFailure.blockerId})`
          : clearanceFailure.blockerId ?? clearanceFailure.reason ?? 'unknown geometry';
        const point = (value: [number, number, number]) =>
          `(${value[0].toFixed(2)}, ${value[2].toFixed(2)})`;
        return `The worker corridor violates exact ${NAV_AGENT_RADIUS_M.toFixed(1)} m clearance near ${blockerLabel} on ${floor?.source.name ?? clearanceFailure.floorId}, between ${point(clearanceFailure.from)} and ${point(clearanceFailure.to)}. Widen that aisle or move the blocking object.`;
      })();
      return {
        failure: appendWarnings(
          preparationFailure ??
            clearanceMessage ??
            'No clear walking route is available. Move the start or destination into a wider aisle, or open a blocked passage and plan again.',
          [start.warning, dest.warning],
        ),
      };
    }
    segments = prepared;
    const waypoints = segments.flatMap((segment) => segment.points);
    const described = {
      lengthM: segments.reduce((sum, segment) => sum + segment.lengthM, 0),
      secondsEta: segments.reduce((sum, segment) => sum + segment.seconds, 0),
      instructions: segmentInstructions(segments, navigationDocument, dest.label),
    };
    const parsed = routeResultSchema.safeParse({
      waypoints: waypoints.length >= 2 ? waypoints : [waypoints[0], waypoints[0]],
      segments,
      lengthM: described.lengthM,
      secondsEta: described.secondsEta,
      instructions: described.instructions,
      option,
      snapped: { start: start.snapped, dest: dest.snapped },
      warnings: [
        start.warning,
        dest.warning,
        ...(request.allowRestricted && role !== 'staff'
          ? ['Restricted-zone access was ignored for the visitor role.']
          : []),
      ].filter((warning): warning is string => !!warning),
    });
    if (!parsed.success) {
      return {
        failure: appendWarnings('Route result failed validation.', [start.warning, dest.warning]),
      };
    }
    routeDestinations.set(parsed.data, structuredClone(request.dest));
    return { result: parsed.data, buildMs: route.buildMs };
  };
  const runBestOption = async (option: 'shortest' | 'accessible') => {
    let best: { result?: RouteResult; failure?: string; buildMs?: number } | undefined;
    let failure: string | undefined;
    const rankedPairs = endpointPairs.map((pair) => ({
      ...pair,
      // Every physical route is at least its horizontal straight-line distance.
      lowerBound: Math.hypot(pair.start.point[0] - pair.dest.point[0], pair.start.point[1] - pair.dest.point[1]),
    })).sort((a, b) => a.lowerBound - b.lowerBound);
    for (const pair of rankedPairs) {
      if (signal.aborted) {
        throw new DOMException('Route cancelled', 'AbortError');
      }
      if (best?.result && pair.lowerBound >= best.result.lengthM) {
        break;
      }
      const candidate = await runOption(option, pair.start, pair.dest);
      if (candidate.result && (!best?.result || candidate.result.lengthM < best.result.lengthM)) {
        best = candidate;
      }
      failure ??= candidate.failure;
    }
    return best ?? { failure: failure ?? 'No reachable authored access point was found.' };
  };
  const selected = await runBestOption(requestedOption);
  if (signal.aborted) {
    throw new DOMException('Route cancelled', 'AbortError');
  }
  const options: RouteOutcome['options'] = {};
  if (selected.result) {
    options[requestedOption] = selected.result;
  } else {
    const newRejections = [...rejected.entries()].filter(
      ([id]) => !document.floors.some((floor) =>
        floor.zones.some((zone) => zone.id.startsWith('route-recovery:') && zone.id.endsWith(`:${id}`)),
      ),
    );
    if (recoveryPass < 2 && newRejections.length && !signal.aborted) {
      const retryDocument = { ...document, floors: document.floors.map((floor) => ({ ...floor,
        zones: [...floor.zones, ...newRejections.filter(([, value]) => value.floorId === floor.source.id)
          .map(([id, value]) => ({ id: `route-recovery:${recoveryPass}:${id}`, label: 'Blocked passage',
            type: 'blocked' as const, polygon: value.polygon }))],
      })) };
      return planWayfindingRoute(
        navigator,
        retryDocument,
        zones,
        request,
        signal,
        role,
        rolePolicy,
        recoveryPass + 1,
      );
    }
    return { request, options, failure: selected.failure ?? 'No route found.' };
  }
  return {
    request,
    options,
    buildMs: selected.buildMs,
  };
}

function explainFailure(message: string, accessible: boolean): string {
  const clean = message.replace(/^Error:\s*/, '');
  if (/collision|geometry|footprint|vertical extent|unrepresentable|malformed/i.test(clean)) {
    return clean;
  }
  if (/clearance|valid/i.test(clean)) {
    return `${clean} Try a point with more clearance.`;
  }
  if (/endpoint/i.test(clean)) {
    return clean;
  }
  const suffix = accessible
    ? ' No step-free route exists: every connection needs stairs or an escalator, or a gap is narrower than the agent diameter (0.8 m).'
    : ' The destination is disconnected, a gap is narrower than the agent diameter (0.8 m), or a closed door blocks the way.';
  return `No path found.${suffix}`;
}
