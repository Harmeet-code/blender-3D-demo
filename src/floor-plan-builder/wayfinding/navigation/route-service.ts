import { pointInPolygon, polygonBounds, polygonEdges, segmentDistance } from '@/utils/geometry/polygon.ts';
import { bakeBooth, boothEdges, boothWorldPoints } from '../../model/booth.ts';
import { objectPoints } from '../../model/geometry.ts';
import { isBooth, type PlanDocument, type PlanObject } from '../../model/types.ts';
import { exitSinkLocal } from '../../model/exit.ts';
import { kioskQueueEntryLocal } from '../../model/kiosk.ts';
import { washroomLandingLocal } from '../../model/washroom.ts';
import { infoCustomerNode } from '../../model/information.ts';
import { firstAidEntryLocal } from '../../model/firstaid.ts';
import { waterApproachNode } from '../../model/water.ts';
import { washRackApproachLocal, washRackWalkableLocal } from '../../model/wash-rack-spatial.ts';
import { circulationEntry } from '../../model/circulation.ts';
import { type StudioNavigator, type PlanRoute } from '../../model/directions.ts';
import { buildFloorNavInput, ZONE_AREA } from './input-builder.ts';
import type { WalkableZone } from '../model/zone-schema.ts';
import {
  routeRequestSchema,
  routeResultSchema,
  type RouteRequest,
  type RouteResult,
} from '../model/route-schema.ts';
import { measuredSegments, segmentInstructions } from '../model/route-segments.ts';

export type Point2 = [number, number];

export interface ResolvedEndpoint {
  floorId: string;
  point: Point2;
  snapped: boolean;
  label: string;
  warning?: string;
}

const authoredWalkableZones = (zones: WalkableZone[], floorId: string) =>
  zones.filter((zone) => zone.floorId === floorId && zone.type !== 'restricted');

/** Returns only the exterior edges of a union, removing shared seams between walkable zones. */
function walkableUnionBoundary(polygons: Point2[][]): Array<[Point2, Point2]> {
  const edges = polygons.flatMap((polygon) => polygonEdges(polygon));
  const insideUnion = (point: Point2) => polygons.some((polygon) => pointInPolygon(point, polygon));
  const boundary: Array<[Point2, Point2]> = [];
  for (const [a, b] of edges) {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      lengthSquared = dx * dx + dz * dz;
    if (lengthSquared < 1e-12) continue;
    const cuts = [0, 1];
    for (const [c, d] of edges) {
      const sx = d[0] - c[0],
        sz = d[1] - c[1],
        qx = c[0] - a[0],
        qz = c[1] - a[1],
        denominator = dx * sz - dz * sx;
      if (Math.abs(denominator) > 1e-10) {
        const t = (qx * sz - qz * sx) / denominator,
          u = (qx * dz - qz * dx) / denominator;
        if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) cuts.push(t);
      } else if (Math.abs(qx * dz - qz * dx) < 1e-9) {
        for (const point of [c, d]) {
          const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSquared;
          if (t > 1e-9 && t < 1 - 1e-9) cuts.push(t);
        }
      }
    }
    cuts.sort((left, right) => left - right);
    for (let index = 1; index < cuts.length; index++) {
      const from = cuts[index - 1]!,
        to = cuts[index]!;
      if (to - from < 1e-9) continue;
      const start: Point2 = [a[0] + dx * from, a[1] + dz * from],
        end: Point2 = [a[0] + dx * to, a[1] + dz * to],
        middle: Point2 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
        normal: Point2 = [
          (-dz / Math.sqrt(lengthSquared)) * 1e-5,
          (dx / Math.sqrt(lengthSquared)) * 1e-5,
        ];
      const leftInside = insideUnion([middle[0] + normal[0], middle[1] + normal[1]]),
        rightInside = insideUnion([middle[0] - normal[0], middle[1] - normal[1]]);
      if (leftInside !== rightInside) boundary.push([start, end]);
    }
  }
  return boundary;
}

function distanceToSegments(point: Point2, edges: Array<[Point2, Point2]>) {
  let distance = Infinity;
  for (const [a, b] of edges) distance = Math.min(distance, segmentDistance(point, a, b));
  return distance;
}

export function invalidConnectorLandings(
  document: PlanDocument,
  zones: WalkableZone[],
  allowRestricted = false,
): string[] {
  return document.baseline.portals
    .filter((portal) => (portal.entries?.length ?? 0) >= 2)
    .filter((portal) =>
      portal.entries!.some((entry) => {
        const landing = resolveEndpoint(
          document,
          { floorId: entry.floorId, kind: 'point', point: entry.position },
          zones,
          undefined,
          allowRestricted,
        );
        return 'error' in landing || landing.snapped;
      }),
    )
    .map((portal) => portal.id);
}

/** Item access point in world coordinates — never the item centre. */
export function itemAccessPoint(object: PlanObject, from?: Point2): Point2 {
  const local = (point: Point2): Point2 => objectPoints(object, [point])[0]!;
  if (isBooth(object)) {
    const baked = bakeBooth(object);
    const edges = boothEdges(baked).filter((edge) => edge.mode !== 'wall');
    const candidates = (edges.length ? edges : boothEdges(baked)).map(
      (edge) =>
        boothWorldPoints(baked, [
          [
            (edge.a[0] + edge.b[0]) / 2 - edge.inward[0] * 0.55,
            (edge.a[1] + edge.b[1]) / 2 - edge.inward[1] * 0.55,
          ],
        ])[0]!,
    );
    if (from) {
      candidates.sort(
        (a, b) =>
          Math.hypot(a[0] - from[0], a[1] - from[1]) - Math.hypot(b[0] - from[0], b[1] - from[1]),
      );
    }
    return candidates[0]!;
  }
  switch (object.recipe) {
    case 'exit':
      return local(exitSinkLocal());
    case 'food-kiosk':
      return local(kioskQueueEntryLocal(object));
    case 'washroom-men':
    case 'washroom-women':
      return local(washroomLandingLocal(object));
    case 'information':
      return local(infoCustomerNode(object));
    case 'first-aid':
      return local(firstAidEntryLocal(object));
    case 'water':
      return local(waterApproachNode());
    case 'wash-rack': {
      const bounds = polygonBounds(washRackApproachLocal(object));
      return local([(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2]);
    }
    case 'entrance':
      return local([0, object.dimensions[2] / 2 + 0.55]);
    default: {
      if (object.circulationDesign) {
        return circulationEntry(object);
      }
      return local([0, Math.max(...object.polygon.map(([, z]) => z)) + 0.55]);
    }
  }
}

function nearestFreedom(
  floors: PlanDocument['floors'],
  floorId: string,
  point: Point2,
  zones: WalkableZone[],
  allowRestricted: boolean,
): Point2 | null {
  const floor = floors.find((item) => item.source.id === floorId);
  if (!floor) {
    return null;
  }
  const input = buildFloorNavInput(
    floorId,
    floor.boundary as Point2[],
    zones,
    floor.objects,
    false,
  );
  input.obstacles.push(
    ...floor.zones.filter((zone) => zone.type === 'blocked').map((zone) => zone.polygon),
    ...(!allowRestricted
      ? zones
          .filter((zone) => zone.floorId === floorId && zone.type === 'restricted')
          .map((zone) => zone.polygon)
      : []),
  );
  const walkableBoundary = walkableUnionBoundary(input.surfaces);
  const clearanceOf = (candidate: Point2): number => {
    let clearance = Infinity;
    for (const polygon of input.obstacles) {
      for (const [a, b] of polygonEdges(polygon)) {
        clearance = Math.min(clearance, segmentDistance(candidate, a, b));
      }
    }
    return clearance;
  };
  let best: Point2 | null = null;
  let nearest = Infinity;
  for (let ring = 1; ring <= 16; ring++) {
    for (let step = 0; step < ring * 8; step++) {
      const angle = (step / (ring * 8)) * Math.PI * 2;
      const candidate: Point2 = [
        point[0] + Math.cos(angle) * ring * 0.25,
        point[1] + Math.sin(angle) * ring * 0.25,
      ];
      const distance = ring * 0.25;
      if (distance >= nearest) {
        continue;
      }
      const walkable = input.surfaces.length
        ? input.surfaces.some((surface) => pointInPolygon(candidate, surface)) &&
          distanceToSegments(candidate, walkableBoundary) >= 0.45
        : true;
      const blocked = input.obstacles.some((polygon) => pointInPolygon(candidate, polygon));
      // The worker sweeps a 0.4 m avatar; snapped points need that clearance.
      if (walkable && !blocked && clearanceOf(candidate) >= 0.45) {
        best = candidate;
        nearest = distance;
      }
    }
    if (best) {
      return best;
    }
  }
  return best;
}

export function resolveEndpoint(
  document: PlanDocument,
  endpoint: RouteRequest['start'],
  zones: WalkableZone[],
  from?: Point2,
  allowRestricted = false,
): ResolvedEndpoint | { error: string } {
  const floor = document.floors.find((item) => item.source.id === endpoint.floorId);
  if (!floor) {
    return { error: 'Unknown floor.' };
  }
  const walkable = authoredWalkableZones(zones, floor.source.id);
  if (!walkable.length) {
    return { error: 'Draw a walkable zone on this floor before planning a route.' };
  }
  const inGeneratedWashRackWalkable = (candidate: Point2) =>
    floor.objects.some(
      (object) =>
        object.recipe === 'wash-rack' &&
        object.washRackVariant &&
        object.collidable &&
        [washRackWalkableLocal(object), washRackApproachLocal(object)].some((polygon) =>
          pointInPolygon(candidate, objectPoints(object, polygon)),
        ),
    );
  let point: Point2;
  let label: string;
  let warning: string | undefined;
  if (endpoint.kind === 'item') {
    const object = floor.objects.find((item) => item.id === endpoint.itemId);
    if (!object) {
      return { error: 'Item no longer exists.' };
    }
    point = itemAccessPoint(object, from);
    label = object.name;
    if (isBooth(object) && boothEdges(bakeBooth(object)).every((edge) => edge.mode === 'wall')) {
      warning = 'This booth has no open edge. The route stops outside its wall.';
    }
  } else {
    point = [...(endpoint.point ?? [0, 0])];
    label = `Point (${point[0].toFixed(1)}, ${point[1].toFixed(1)})`;
  }
  if (
    !walkable.some((zone) => pointInPolygon(point, zone.polygon as Point2[])) &&
    !inGeneratedWashRackWalkable(point)
  ) {
    return { error: `${label} is outside a walkable zone.` };
  }
  const input = buildFloorNavInput(
    floor.source.id,
    floor.boundary as Point2[],
    zones,
    floor.objects,
    false,
  );
  input.obstacles.push(
    ...floor.zones.filter((zone) => zone.type === 'blocked').map((zone) => zone.polygon),
    ...(!allowRestricted
      ? zones
          .filter((zone) => zone.floorId === floor.source.id && zone.type === 'restricted')
          .map((zone) => zone.polygon)
      : []),
  );
  const insideWalkable =
    !input.surfaces.length || input.surfaces.some((surface) => pointInPolygon(point, surface));
  const insideObstacle = input.obstacles.some((polygon) => pointInPolygon(point, polygon));
  let clearance = Infinity;
  for (const polygon of input.obstacles) {
    for (const [a, b] of polygonEdges(polygon)) {
      clearance = Math.min(clearance, segmentDistance(point, a, b));
    }
  }
  const inset = input.surfaces.length
    ? distanceToSegments(point, walkableUnionBoundary(input.surfaces))
    : Infinity;
  if (insideWalkable && !insideObstacle && clearance >= 0.45 && inset >= 0.45) {
    return { floorId: floor.source.id, point, snapped: false, label, warning };
  }
  if (endpoint.kind === 'point') {
    return { error: `${label} does not have enough clearance for a route.` };
  }
  const fallback = nearestFreedom(document.floors, floor.source.id, point, zones, allowRestricted);
  if (!fallback) {
    return { error: 'No walkable point on this floor.' };
  }
  return { floorId: floor.source.id, point: fallback, snapped: true, label, warning };
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

export interface RouteOutcome {
  request: RouteRequest;
  options: { shortest?: RouteResult; accessible?: RouteResult };
  failure?: string;
  failures?: Partial<Record<'shortest' | 'accessible', string>>;
  buildMs?: number;
}

export async function planWayfindingRoute(
  navigator: StudioNavigator,
  document: PlanDocument,
  zones: WalkableZone[],
  request: RouteRequest,
  signal: AbortSignal,
): Promise<RouteOutcome> {
  const valid = routeRequestSchema.safeParse(request);
  if (!valid.success) {
    return { request, options: {}, failure: 'Invalid route endpoints.' };
  }
  if (signal.aborted) {
    throw new DOMException('Route cancelled', 'AbortError');
  }
  const missingZoneFloor = [request.start.floorId, request.dest.floorId].find(
    (floorId) => !authoredWalkableZones(zones, floorId).length,
  );
  if (missingZoneFloor) {
    return {
      request,
      options: {},
      failure: `Draw a walkable zone on ${document.floors.find((floor) => floor.source.id === missingZoneFloor)?.source.name ?? 'each route floor'} before testing routes.`,
    };
  }
  const start = resolveEndpoint(document, request.start, zones, undefined, request.allowRestricted);
  const dest = resolveEndpoint(
    document,
    request.dest,
    zones,
    'point' in start ? start.point : undefined,
    request.allowRestricted,
  );
  if ('error' in start) {
    return { request, options: {}, failure: `Start: ${start.error}` };
  }
  if ('error' in dest) {
    return { request, options: {}, failure: `Destination: ${dest.error}` };
  }
  if (
    start.floorId === dest.floorId &&
    Math.hypot(start.point[0] - dest.point[0], start.point[1] - dest.point[1]) < 1e-4
  ) {
    const y =
      document.floors.find((floor) => floor.source.id === start.floorId)?.source.heightOffset ?? 0;
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
      option: 'shortest',
      snapped: { start: start.snapped, dest: dest.snapped },
      warnings: [],
    };
    return {
      request,
      options: { shortest: result, accessible: { ...result, option: 'accessible' } },
    };
  }
  const runOption = async (
    option: 'shortest' | 'accessible',
  ): Promise<{ result?: RouteResult; failure?: string; buildMs?: number }> => {
    const accessible = option === 'accessible';
    const invalidLandings = invalidConnectorLandings(document, zones, request.allowRestricted);
    const disabledPortals = accessible
      ? document.floors
          .flatMap((floor) => floor.objects)
          .filter((object) => object.recipe === 'stairs' || object.recipe === 'escalator')
          .map((object) => object.portalId)
          .filter((id): id is string => !!id)
      : [...invalidLandings];
    if (accessible) disabledPortals.push(...invalidLandings);
    if (disabledPortals) {
      const ramps = new Set(
        document.floors
          .flatMap((floor) => floor.objects)
          .filter((object) => object.recipe === 'ramp')
          .map((object) => object.portalId),
      );
      disabledPortals.push(
        ...document.baseline.portals
          .filter((portal) => portal.type !== 'elevator' && !ramps.has(portal.id))
          .map((portal) => portal.id),
      );
    }
    const navAreas: Record<string, { polygon: Point2[]; area: number; flags: number }[]> = {};
    for (const floor of document.floors) {
      const input = buildFloorNavInput(
        floor.source.id,
        floor.boundary as Point2[],
        zones,
        floor.objects,
        false,
      );
      if (input.areas.length) {
        navAreas[floor.source.id] = input.areas;
      }
    }
    const queryFilter = {
      includeFlags: 0xffff,
      excludeFlags: request.allowRestricted ? 0 : ZONE_AREA.restricted.flags,
      areaCosts: [[ZONE_AREA['queue-area'].area, 3]] as (readonly [number, number])[],
    };
    let route: PlanRoute;
    try {
      route = await navigator.plan(
        document,
        { floorId: start.floorId, point: start.point },
        { floorId: dest.floorId, point: dest.point },
        signal,
        {
          walkableZones: zones.map((zone) => ({
            id: zone.id,
            floorId: zone.floorId,
            polygon: zone.polygon as Point2[],
            holes: zone.holes as Point2[][],
          })),
          navAreas: Object.keys(navAreas).length ? navAreas : undefined,
          queryFilter,
          disabledPortals,

          straight: true,
        },
      );
    } catch (error) {
      return { failure: explainFailure(String(error), accessible) };
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
      return { failure: 'A route endpoint does not have enough walkable clearance.' };
    }
    const floorY = (floorId: string) =>
      document.floors.find((floor) => floor.source.id === floorId)?.source.heightOffset ?? 0;
    const segments = measuredSegments(
      route,
      document,
      [start.point[0], floorY(start.floorId), start.point[1]],
      [dest.point[0], floorY(dest.floorId), dest.point[1]],
    );
    const waypoints = segments.flatMap((segment) => segment.points);
    const described = {
      lengthM: segments.reduce((sum, segment) => sum + segment.lengthM, 0),
      secondsEta: segments.reduce((sum, segment) => sum + segment.seconds, 0),
      instructions: segmentInstructions(segments, document, dest.label),
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
        ...(request.allowRestricted ? ['Route may cross a restricted zone.'] : []),
      ].filter((warning): warning is string => !!warning),
    });
    if (!parsed.success) {
      return { failure: 'Route result failed validation.' };
    }
    return { result: parsed.data, buildMs: route.buildMs };
  };
  const shortest = await runOption('shortest');
  if (signal.aborted) {
    throw new DOMException('Route cancelled', 'AbortError');
  }
  const accessible = await runOption('accessible');
  const options: { shortest?: RouteResult; accessible?: RouteResult } = {};
  if (shortest.result) {
    options.shortest = shortest.result;
  }
  if (accessible.result) {
    options.accessible = accessible.result;
  }
  if (!options.shortest && !options.accessible) {
    return {
      request,
      options,
      failure: accessible.failure ?? shortest.failure ?? 'No route found.',
    };
  }
  return {
    request,
    options,
    failures: {
      ...(shortest.failure ? { shortest: shortest.failure } : {}),
      ...(accessible.failure ? { accessible: accessible.failure } : {}),
    },
    buildMs: shortest.buildMs ?? accessible.buildMs,
  };
}

function explainFailure(message: string, accessible: boolean): string {
  const clean = message.replace(/^Error:\s*/, '');
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
