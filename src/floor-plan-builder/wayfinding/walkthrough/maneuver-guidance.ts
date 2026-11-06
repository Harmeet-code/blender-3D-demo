import type { PlanDocument } from '../../model/types.ts';
import type { RouteResult } from '../model/route-schema.ts';
import { sampleLeg, type MotionLeg, type Vec3, type WalkPath } from './path.ts';

const TURN_THRESHOLD_RADIANS = 0.35;
const HEADING_SAMPLE_M = 0.75;
const TURN_GROUP_M = 0.75;
const PASSED_TOLERANCE_M = 0.05;
const PLANAR_EPSILON_M = 1e-4;

type TurnKind = 'left' | 'right';
type VerticalDirection = 'up' | 'down' | 'level';

interface TurnEvent {
  id: string;
  kind: TurnKind;
  distanceM: number;
  legIndex: number;
}

interface ConnectorEvent {
  id: string;
  kind: 'connector';
  distanceM: number;
  legIndex: number;
}

type RouteEvent = TurnEvent | ConnectorEvent;

export type WalkManeuver =
  | {
      id: string;
      kind: TurnKind | 'straight';
      distanceM: number;
    }
  | {
      id: string;
      kind: 'connector';
      distanceM: number;
      active: boolean;
      connectorKind: MotionLeg['kind'];
      toFloorId: string;
      verticalDirection: VerticalDirection;
    }
  | {
      id: 'arrive';
      kind: 'arrive';
      distanceM: 0;
    };

export interface WalkManeuverCopy {
  title: string;
  detail?: string;
  metric: string | null;
  metricLabel: string | null;
  announcement: string;
}

const eventCache = new WeakMap<WalkPath, RouteEvent[]>();

function samplePlanar(leg: MotionLeg, distanceM: number): [number, number] {
  const distance = Math.min(leg.length, Math.max(0, distanceM));
  let lo = 1;
  let hi = leg.lengths.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (leg.lengths[mid]! < distance) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const a = leg.points[Math.max(0, lo - 1)] ?? leg.points[0]!;
  const b = leg.points[lo] ?? a;
  const start = leg.lengths[Math.max(0, lo - 1)] ?? 0;
  const span = Math.max(PLANAR_EPSILON_M, (leg.lengths[lo] ?? start) - start);
  const ratio = Math.min(1, Math.max(0, (distance - start) / span));
  return [a[0] + (b[0] - a[0]) * ratio, a[2] + (b[2] - a[2]) * ratio];
}

function turnKind(
  before: readonly [number, number],
  pivot: readonly [number, number],
  after: readonly [number, number],
): TurnKind | null {
  const incomingX = pivot[0] - before[0];
  const incomingZ = pivot[1] - before[1];
  const outgoingX = after[0] - pivot[0];
  const outgoingZ = after[1] - pivot[1];
  const incomingLength = Math.hypot(incomingX, incomingZ);
  const outgoingLength = Math.hypot(outgoingX, outgoingZ);
  if (incomingLength < PLANAR_EPSILON_M || outgoingLength < PLANAR_EPSILON_M) {
    return null;
  }
  const angle = Math.atan2(
    incomingX * outgoingZ - incomingZ * outgoingX,
    incomingX * outgoingX + incomingZ * outgoingZ,
  );
  if (Math.abs(angle) < TURN_THRESHOLD_RADIANS) {
    return null;
  }
  return angle > 0 ? 'right' : 'left';
}

function appendTurn(events: RouteEvent[], event: TurnEvent) {
  const previous = events.at(-1);
  if (
    previous &&
    previous.kind === event.kind &&
    event.distanceM - previous.distanceM <= TURN_GROUP_M
  ) {
    events[events.length - 1] = event;
    return;
  }
  events.push(event);
}

function routeEvents(path: WalkPath): RouteEvent[] {
  const cached = eventCache.get(path);
  if (cached) {
    return cached;
  }
  // Sample around each vertex so the short chords of a rounded corner become one maneuver.
  const events: RouteEvent[] = [];
  path.legs.forEach((leg, legIndex) => {
    if (leg.toFloorId) {
      events.push({
        id: `connector:${legIndex}`,
        kind: 'connector',
        distanceM: leg.offset,
        legIndex,
      });
    } else {
      for (let pointIndex = 1; pointIndex < leg.points.length - 1; pointIndex++) {
        const localDistance = leg.lengths[pointIndex]!;
        const before = samplePlanar(leg, localDistance - HEADING_SAMPLE_M);
        const pivot = [leg.points[pointIndex]![0], leg.points[pointIndex]![2]] as const;
        const after = samplePlanar(leg, localDistance + HEADING_SAMPLE_M);
        const kind = turnKind(before, pivot, after);
        if (kind) {
          appendTurn(events, {
            id: `turn:${legIndex}:${pointIndex}`,
            kind,
            distanceM: leg.offset + localDistance,
            legIndex,
          });
        }
      }
    }

    const next = path.legs[legIndex + 1];
    if (!next || next.toFloorId || (leg.toFloorId ?? leg.floorId) !== next.floorId) {
      return;
    }
    const end = leg.points.at(-1)!;
    const start = next.points[0]!;
    if (Math.hypot(end[0] - start[0], end[2] - start[2]) > 0.25) {
      return;
    }
    const kind = turnKind(
      samplePlanar(leg, leg.length - HEADING_SAMPLE_M),
      [end[0], end[2]],
      samplePlanar(next, HEADING_SAMPLE_M),
    );
    if (kind) {
      appendTurn(events, {
        id: `turn:${legIndex + 1}:start`,
        kind,
        distanceM: next.offset,
        legIndex: legIndex + 1,
      });
    }
  });
  eventCache.set(path, events);
  return events;
}

function legAtDistance(path: WalkPath, distanceM: number): number {
  const index = path.legs.findIndex(
    (leg, legIndex) =>
      distanceM < leg.offset + leg.length - PASSED_TOLERANCE_M || legIndex === path.legs.length - 1,
  );
  return Math.max(0, index);
}

function verticalDirection(leg: MotionLeg): VerticalDirection {
  const change = leg.points.at(-1)![1] - leg.points[0]![1];
  return change > 0.1 ? 'up' : change < -0.1 ? 'down' : 'level';
}

export function nextWalkManeuver({
  path,
  distanceM,
  legIndex,
  arrived,
}: {
  path: WalkPath;
  distanceM: number;
  legIndex?: number;
  arrived: boolean;
}): WalkManeuver {
  if (arrived || !path.legs.length) {
    return { id: 'arrive', kind: 'arrive', distanceM: 0 };
  }
  const distance = Math.min(path.length, Math.max(0, distanceM));
  const currentLegIndex =
    legIndex !== undefined && legIndex >= 0 && legIndex < path.legs.length
      ? legIndex
      : legAtDistance(path, distance);
  const currentLeg = path.legs[currentLegIndex]!;
  const currentLegEnd = currentLeg.offset + currentLeg.length;
  if (
    currentLeg.toFloorId &&
    distance >= currentLeg.offset - PASSED_TOLERANCE_M &&
    distance <= currentLegEnd + PASSED_TOLERANCE_M
  ) {
    return {
      id: `connector:${currentLegIndex}:active`,
      kind: 'connector',
      distanceM: Math.max(0, currentLegEnd - distance),
      active: true,
      connectorKind: currentLeg.kind,
      toFloorId: currentLeg.toFloorId,
      verticalDirection: verticalDirection(currentLeg),
    };
  }

  const event = routeEvents(path).find(
    (candidate) =>
      candidate.legIndex >= currentLegIndex && candidate.distanceM >= distance - PASSED_TOLERANCE_M,
  );
  if (event?.kind === 'connector') {
    const leg = path.legs[event.legIndex]!;
    return {
      id: event.id,
      kind: 'connector',
      distanceM: Math.max(0, event.distanceM - distance),
      active: false,
      connectorKind: leg.kind,
      toFloorId: leg.toFloorId!,
      verticalDirection: verticalDirection(leg),
    };
  }
  if (event) {
    return {
      id: event.id,
      kind: event.kind,
      distanceM: Math.max(0, event.distanceM - distance),
    };
  }
  return {
    id: `straight:${currentLegIndex}`,
    kind: 'straight',
    distanceM: Math.max(0, path.length - distance),
  };
}

export function walkDestinationLabel(route: RouteResult | null | undefined) {
  return (
    route?.instructions
      .at(-1)
      ?.replace(/^Arrive at\s+/i, '')
      .replace(/[.!]$/, '') ?? 'Selected destination'
  );
}

/** A paused route is current only while the walker remains at its published path position. */
export function isWalkRoutePoseCurrent({
  path,
  distanceM,
  legIndex,
  floorId,
  position,
  toleranceM = 0.12,
}: {
  path: WalkPath;
  distanceM: number;
  legIndex?: number;
  floorId: string;
  position: readonly [number, number, number];
  toleranceM?: number;
}) {
  if (!path.legs.length || !Number.isFinite(distanceM) || !position.every(Number.isFinite)) {
    return false;
  }
  const distance = Math.min(path.length, Math.max(0, distanceM));
  const currentLegIndex =
    legIndex !== undefined && legIndex >= 0 && legIndex < path.legs.length
      ? legIndex
      : legAtDistance(path, distance);
  const leg = path.legs[currentLegIndex]!;
  if (floorId !== leg.floorId && floorId !== leg.toFloorId) {
    return false;
  }
  const expected: Vec3 = [0, 0, 0];
  const tangent: Vec3 = [0, 0, 0];
  sampleLeg(leg, Math.min(leg.length, Math.max(0, distance - leg.offset)), expected, tangent);
  return Math.hypot(expected[0] - position[0], expected[2] - position[2]) <= toleranceM;
}

function floorLabel(document: PlanDocument, floorId: string) {
  return document.floors.find((floor) => floor.source.id === floorId)?.source.name ?? floorId;
}

function connectorInstruction(
  maneuver: Extract<WalkManeuver, { kind: 'connector' }>,
  floor: string,
) {
  const noun = maneuver.connectorKind === 'walk' ? 'connector' : maneuver.connectorKind;
  const direction = maneuver.verticalDirection === 'level' ? '' : ` ${maneuver.verticalDirection}`;
  if (!maneuver.active) {
    return `Take the ${noun}${direction} to ${floor}`;
  }
  if (maneuver.connectorKind === 'elevator') {
    return `Continue in the elevator to ${floor}`;
  }
  if (maneuver.connectorKind === 'walk') {
    return `Continue through the connector to ${floor}`;
  }
  const activeDirection =
    maneuver.verticalDirection === 'level' ? 'on' : maneuver.verticalDirection;
  return `Continue ${activeDirection} the ${noun} to ${floor}`;
}

export function describeWalkManeuver(
  maneuver: WalkManeuver,
  document: PlanDocument,
  destination: string,
  phase: string,
): WalkManeuverCopy {
  if (maneuver.kind === 'arrive') {
    return {
      title: 'You have arrived',
      detail: destination,
      metric: null,
      metricLabel: null,
      announcement: `You have arrived at ${destination}.`,
    };
  }
  const now = maneuver.distanceM < 0.75;
  const meters = now ? 0 : Math.max(1, Math.ceil(maneuver.distanceM));
  const metric = now ? 'Now' : `${meters} m`;
  const spokenMeters =
    meters > 20
      ? Math.ceil(meters / 10) * 10
      : meters > 5
        ? Math.ceil(meters / 5) * 5
        : meters > 2
          ? 5
          : meters;
  const approximate = spokenMeters !== meters;
  const spokenDistance = now
    ? 'now'
    : `in ${approximate ? 'about ' : ''}${spokenMeters} ${spokenMeters === 1 ? 'meter' : 'meters'}`;
  if (maneuver.kind === 'connector') {
    const title = connectorInstruction(maneuver, floorLabel(document, maneuver.toFloorId));
    return {
      title,
      detail: maneuver.active ? phase : 'Floor transition',
      metric,
      metricLabel: maneuver.active ? 'to exit' : 'to connector',
      announcement: `${title}, ${spokenDistance}.`,
    };
  }
  const title =
    maneuver.kind === 'left'
      ? 'Turn left'
      : maneuver.kind === 'right'
        ? 'Turn right'
        : 'Continue straight';
  return {
    title,
    detail: maneuver.kind === 'straight' ? `Toward ${destination}` : undefined,
    metric,
    metricLabel: maneuver.kind === 'straight' ? 'remaining' : 'to turn',
    announcement: `${title} ${spokenDistance}.`,
  };
}
