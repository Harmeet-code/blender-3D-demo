import type { Point3 } from '../collision/capsule-clearance.ts';

export type PhysicalConnectorKind = 'stairs' | 'ramp' | 'elevator' | 'escalator';
export type ConnectorPoint = readonly [number, number, number];

export interface ConnectorStop {
  floorId: string;
  /** Feet position in the same absolute building frame as the capsule runtime. */
  entry: ConnectorPoint;
  yawRadians: number;
}

export interface ConnectorPath {
  /** Explicit, ordered, authored path samples; these are never inferred from two portal entries. */
  points: readonly ConnectorPoint[];
  /** Width of the traversable surface, in metres, from the source geometry. */
  widthM: number;
  /** Geometry evidence that binds this path to an authored instance. */
  authoredInstanceId: string;
  source: 'document' | 'existing-asset-metadata';
}

export interface ConnectorRecord {
  id: string;
  portalId: string;
  kind: PhysicalConnectorKind;
  stops: readonly ConnectorStop[];
  /** Required for stairs, ramps and escalators. Elevator movement is determined by explicit stops. */
  path?: ConnectorPath;
  /** Optional authored restrictions; missing means no additional restriction. */
  allowedRoles?: readonly ('staff' | 'visitor')[];
  accessible: boolean;
  enabled: boolean;
  /** Elevator wait/door timings and escalator passenger-belt speed are authored/runtime policy inputs. */
  transferSeconds?: number;
  speedMps?: number;
}

export type ConnectorStage =
  | 'approach'
  | 'wait'
  | 'door-open'
  | 'board'
  | 'ride'
  | 'exit'
  | 'traverse'
  | 'board-belt'
  | 'belt-ride'
  | 'disembark'
  | 'complete'
  | 'blocked';

export interface ConnectorFrame {
  connectorId: string;
  stage: ConnectorStage;
  floorId: string;
  feet: Point3;
  yawRadians: number;
  walking: boolean;
  distanceM: number;
  progress: number;
  reason?: string;
}

export interface ConnectorTraversalRequest {
  record: ConnectorRecord;
  /** Portal selected by routing; prevents resolving a different connector record by floor alone. */
  portalId: string;
  fromFloorId: string;
  toFloorId: string;
  role: 'staff' | 'visitor';
  accessibleOnly?: boolean;
  /** Must run the shared capsule gate on every proposed movement sample. */
  validateSweep(fromFeet: Point3, toFeet: Point3): { clear: boolean; reason?: string };
  validateEndpoint(floorId: string, feet: Point3): { clear: boolean; reason?: string };
  /** Must establish that these authored samples belong to the selected portal/physical instance. */
  validatePathBinding(path: ConnectorPath, portalId: string): boolean;
  /** Must validate the full continuous ride in the cabin collision context, including intermediate poses. */
  validateElevatorRide?(from: ConnectorPoint, to: ConnectorPoint): { clear: boolean; continuous: boolean; reason?: string };
}

export interface ConnectorTraversalPlan {
  connectorId: string;
  portalId: string;
  kind: PhysicalConnectorKind;
  from: ConnectorStop;
  to: ConnectorStop;
  points: readonly ConnectorPoint[];
  speedMps: number;
  transferSeconds: number;
  direction: 1 | -1;
}

const finitePoint = (point: ConnectorPoint) => point.length === 3 && point.every(Number.isFinite);
const distance = (a: ConnectorPoint, b: ConnectorPoint) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const reverse = <T>(items: readonly T[]) => [...items].reverse();

function invalid(record: ConnectorRecord, reason: string): ConnectorFrame {
  const stop = record.stops[0];
  return {
    connectorId: record.id,
    stage: 'blocked',
    floorId: stop?.floorId ?? '',
    feet: stop?.entry ? [...stop.entry] as Point3 : [0, 0, 0],
    yawRadians: stop?.yawRadians ?? 0,
    walking: false,
    distanceM: 0,
    progress: 0,
    reason,
  };
}

/** Resolve a connector only from complete, linked authoring evidence. Missing geometry fails closed. */
export function resolveConnectorTraversal(request: ConnectorTraversalRequest): ConnectorTraversalPlan | ConnectorFrame {
  if (!request || !request.record || !Array.isArray(request.record.stops)) return invalid({ id: '', stops: [] } as ConnectorRecord, 'Connector request is incomplete.');
  const { record, fromFloorId, toFloorId, role } = request;
  if (!request.portalId || request.portalId !== record.portalId) return invalid(record, 'Selected portal does not match this connector.');
  if (!record.enabled) return invalid(record, 'This connector is disabled.');
  if (record.allowedRoles && !record.allowedRoles.includes(role)) return invalid(record, 'This connector is unavailable for the current role.');
  if (request.accessibleOnly && !record.accessible) return invalid(record, 'This connector is not marked accessible.');
  if (!record.id || !record.portalId || !record.stops.length || record.stops.some((stop) => !stop.floorId || !finitePoint(stop.entry) || !Number.isFinite(stop.yawRadians))) {
    return invalid(record, 'Connector stop data is incomplete or invalid.');
  }
  const from = record.stops.find((stop) => stop.floorId === fromFloorId);
  const to = record.stops.find((stop) => stop.floorId === toFloorId);
  if (!from || !to || from === to) return invalid(record, 'The requested floors are not distinct authored stops on this connector.');
  if (record.kind !== 'elevator' && record.kind !== 'stairs' && record.kind !== 'ramp' && record.kind !== 'escalator') return invalid(record, 'Connector kind is unsupported.');
  if (record.speedMps !== undefined && (!Number.isFinite(record.speedMps) || record.speedMps <= 0)) return invalid(record, 'Connector speed must be finite and positive.');
  if (record.transferSeconds !== undefined && (!Number.isFinite(record.transferSeconds) || record.transferSeconds < 0)) return invalid(record, 'Connector transfer duration must be finite and non-negative.');
  if (record.kind !== 'elevator') {
    const path = record.path;
    if (!path || path.points.length < 2 || !path.points.every(finitePoint) || !Number.isFinite(path.widthM) || path.widthM <= 0 || !path.authoredInstanceId?.trim() || (path.source !== 'document' && path.source !== 'existing-asset-metadata')) {
      return invalid(record, 'A linked authored traversable path and width are required for this connector.');
    }
    try {
      if (typeof request.validatePathBinding !== 'function' || !request.validatePathBinding(path, request.portalId)) return invalid(record, 'Authored path is not bound to the selected portal instance.');
    } catch {
      return invalid(record, 'Authored path binding could not be verified.');
    }
    const atFrom = distance(path.points[0]!, from.entry) <= distance(path.points.at(-1)!, from.entry) ? 0 : path.points.length - 1;
    const atTo = atFrom === 0 ? path.points.length - 1 : 0;
    if (distance(path.points[atFrom]!, from.entry) > 0.75 || distance(path.points[atTo]!, to.entry) > 0.75) {
      return invalid(record, 'Authored path endpoints do not bind to the requested floor stops.');
    }
    const points = atFrom === 0 ? [...path.points] : reverse(path.points);
    // The endpoint tolerance only selects orientation. Validate the actual gaps that traversal will cross.
    try {
      for (const [stop, endpoint] of [[from, points[0]!], [to, points.at(-1)!]] as const) {
        const result = request.validateSweep(stop.entry as Point3, endpoint as Point3);
        if (!result?.clear) return invalid(record, result?.reason ?? `Capsule clearance blocked between the ${stop.floorId} stop and path.`);
      }
      for (let index = 1; index < points.length; index++) {
        const result = request.validateSweep(points[index - 1] as Point3, points[index] as Point3);
        if (!result?.clear) return invalid(record, result?.reason ?? `Capsule clearance blocked at path sample ${index}.`);
      }
      for (const stop of [from, to]) {
        const result = request.validateEndpoint(stop.floorId, stop.entry as Point3);
        if (!result?.clear) return invalid(record, result?.reason ?? `Capsule cannot stand at the ${stop.floorId} landing.`);
      }
    } catch {
      return invalid(record, 'Connector capsule clearance could not be verified.');
    }
    return {
      connectorId: record.id, portalId: record.portalId, kind: record.kind, from, to,
      points, speedMps: record.speedMps ?? 0.8, transferSeconds: record.transferSeconds ?? 0,
      direction: record.stops.indexOf(from) <= record.stops.indexOf(to) ? 1 : -1,
    };
  }
  if (record.stops.length < 2 || !Number.isFinite(record.transferSeconds) || record.transferSeconds! <= 0) {
    return invalid(record, 'Elevator requires explicit stops and a positive authored transfer duration.');
  }
  try {
    for (const stop of [from, to]) {
      const result = request.validateEndpoint(stop.floorId, stop.entry as Point3);
      if (!result?.clear) return invalid(record, result?.reason ?? `Capsule cannot stand at the ${stop.floorId} elevator landing.`);
    }
  } catch {
    return invalid(record, 'Elevator landing clearance could not be verified.');
  }
  if (!request.validateElevatorRide) return invalid(record, 'Elevator cabin collision context is not connected.');
  try {
    const ride = request.validateElevatorRide(from.entry, to.entry);
    if (!ride?.clear || ride.continuous !== true) return invalid(record, ride?.reason ?? 'Continuous elevator ride clearance is unavailable.');
  } catch {
    return invalid(record, 'Continuous elevator ride clearance could not be verified.');
  }
  return {
    connectorId: record.id, portalId: record.portalId, kind: record.kind, from, to,
    points: [from.entry, to.entry], speedMps: record.speedMps ?? 1, transferSeconds: record.transferSeconds!,
    direction: record.stops.indexOf(from) <= record.stops.indexOf(to) ? 1 : -1,
  };
}

/** Convert elapsed route time into explicit connector states; gait advances only over walking stages. */
export function sampleConnectorTraversal(plan: ConnectorTraversalPlan, elapsedSeconds: number): ConnectorFrame {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) elapsedSeconds = 0;
  const points = plan.points;
  const lengths = points.slice(1).map((point, index) => distance(points[index]!, point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const speed = Math.max(0.1, plan.speedMps);
  const travelSeconds = total / speed;
  const elevatorDuration = plan.kind === 'elevator' ? plan.transferSeconds : 0;
  const duration = plan.kind === 'elevator' ? elevatorDuration : travelSeconds;
  let stage: ConnectorStage;
  let pathProgress = duration <= 0 ? 1 : Math.min(1, Math.max(0, elapsedSeconds / duration));
  let walking = true;
  if (plan.kind === 'elevator') {
    walking = false;
    const wait = plan.transferSeconds;
    const phase = wait <= 0 ? 1 : Math.min(1, elapsedSeconds / wait);
    if (phase < 0.2) { stage = 'wait'; pathProgress = 0; }
    else if (phase < 0.3) { stage = 'door-open'; pathProgress = 0; }
    else if (phase < 0.4) { stage = 'board'; pathProgress = 0; }
    else if (phase < 0.8) { stage = 'ride'; pathProgress = (phase - 0.4) / 0.4; }
    else if (phase < 1) { stage = 'exit'; pathProgress = 1; }
    else { stage = 'complete'; pathProgress = 1; }
  } else if (plan.kind === 'escalator') {
    if (elapsedSeconds < 0.5) stage = 'board-belt';
    else if (elapsedSeconds < Math.max(0.5, travelSeconds - 0.5)) stage = 'belt-ride';
    else stage = elapsedSeconds < travelSeconds ? 'disembark' : 'complete';
    walking = stage === 'board-belt' || stage === 'belt-ride' || stage === 'disembark';
  } else {
    stage = elapsedSeconds < travelSeconds ? 'traverse' : 'complete';
  }
  const progress = pathProgress;
  const targetDistance = progress * total;
  let traversed = 0;
  let feet: ConnectorPoint = points.at(-1) ?? plan.to.entry;
  let yawRadians = plan.to.yawRadians;
  for (let i = 0; i < lengths.length; i++) {
    const segment = lengths[i]!;
    if (targetDistance <= traversed + segment || i === lengths.length - 1) {
      const t = segment <= 1e-9 ? 1 : Math.min(1, (targetDistance - traversed) / segment);
      const a = points[i]!, b = points[i + 1]!;
      feet = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      yawRadians = Math.atan2(b[0] - a[0], b[2] - a[2]);
      break;
    }
    traversed += segment;
  }
  const floorId = progress >= 1 ? plan.to.floorId : plan.from.floorId;
  return {
    connectorId: plan.connectorId, stage, floorId, feet: [...feet] as Point3, yawRadians,
    walking: walking && stage !== 'complete', distanceM: total * progress, progress,
  };
}
