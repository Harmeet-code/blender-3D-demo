import { CHARACTER_CONFIG } from '../character-config.ts';
import { sampleLeg, type MotionLeg, type Vec3 } from '../path.ts';

/** Walk intent consumed by the route-motion owner. `stop` requests a smooth stop. */
export interface RouteSteeringState {
  distanceM: number;
  speedMps: number;
  yawRadians: number;
}

export interface RouteSteeringInput {
  leg: MotionLeg;
  state: RouteSteeringState;
  dtSeconds: number;
  stop?: boolean;
  /** Optional movement speed cap, e.g. a caller-selected walk/sprint speed. */
  speedLimitMps?: number;
  /** Playback rate applied to route distance; acceleration remains bounded in real seconds. */
  timeScale?: number;
  /** Required swept-capsule check. Return true only when the full candidate is clear. */
  validateDisplacement: (from: Vec3, displacement: Vec3) => boolean;
}

export interface RouteSteeringIntent {
  /** Candidate displacement. It must be clearance-validated before the caller commits it. */
  displacement: Vec3;
  /** Look target leads the body along the route to reduce late head/body turns. */
  gazeTarget: Vec3;
  targetYawRadians: number;
  speedMps: number;
  accelerationMps2: number;
  distanceM: number;
  arrived: boolean;
  stopped: boolean;
  blocked: boolean;
  lookaheadSeconds: number;
  gazeLeadSeconds: number;
}

export interface ValidatedRoute {
  points: Vec3[];
  lengths: number[];
  length: number;
  /** Null when the caller did not provide real obstacle-clearance measurements. */
  comfortClearanceP90M: number | null;
  comfortTargetMet: boolean | null;
  comfortDisposition: 'met' | 'offset-improved' | 'no-safe-offset-found' | 'no-improving-offset-found' | 'unavailable';
}

export interface CornerSmoothingOptions {
  /** Desired geometric radius for a smoothed corner. */
  cornerRadiusM?: number;
  /** Capsule radius used by the caller's swept segment validator. */
  capsuleRadiusM?: number;
  /** Extra corner radius margin over the capsule radius. */
  cornerMarginM?: number;
  /** Optional real center-to-obstacle clearance sample, in meters. */
  measureClearanceM?: (point: Vec3) => number | null;
  /** Number of straight capsule-swept segments used to approximate each curve. */
  curveSegments?: number;
  /** Must approve the entire swept capsule between each pair of points. */
  validateSegment: (from: Vec3, to: Vec3) => boolean;
}

/**
 * Round polyline corners without losing the route's clearance guarantee. Every output
 * chord is swept independently. If a rounded corner fails, its trim is halved until
 * validated; the raw corner is the final fallback and must pass too.
 */
function buildValidatedRoute(points: readonly Vec3[], options: CornerSmoothingOptions): ValidatedRoute | null {
  const capsuleRadius = options.capsuleRadiusM ?? CHARACTER_CONFIG.radiusM;
  const margin = options.cornerMarginM ?? 0.05;
  const requestedRadius = options.cornerRadiusM ?? capsuleRadius + margin;
  const radius = Math.max(capsuleRadius, requestedRadius);
  const segments = options.curveSegments ?? 4;
  const valid = Number.isFinite(radius) && Number.isFinite(capsuleRadius) && capsuleRadius > 0 &&
    Number.isFinite(margin) && margin >= 0 && Number.isInteger(segments) && segments >= 1 &&
    points.length >= 2 && points.every((point) => point.length === 3 && point.every(Number.isFinite));
  if (!valid) {return null;}

  const out: Vec3[] = [[...points[0]!] as Vec3];
  const validateAppend = (candidate: readonly Vec3[]) => {
    let from = out[out.length - 1]!;
    for (const to of candidate) {
      let accepted = false;
      try { accepted = options.validateSegment(from, to) === true; } catch { accepted = false; }
      if (!accepted) {return false;}
      from = to;
    }
    out.push(...candidate.map((point) => [...point] as Vec3));
    return true;
  };
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!, corner = points[i]!, b = points[i + 1]!;
    let accepted = false;
    const incomingLength = Math.hypot(corner[0] - a[0], corner[1] - a[1], corner[2] - a[2]);
    const outgoingLength = Math.hypot(b[0] - corner[0], b[1] - corner[1], b[2] - corner[2]);
    if (incomingLength > 1e-4 && outgoingLength > 1e-4) {
      const u: Vec3 = [(a[0] - corner[0]) / incomingLength, (a[1] - corner[1]) / incomingLength, (a[2] - corner[2]) / incomingLength];
      const v: Vec3 = [(b[0] - corner[0]) / outgoingLength, (b[1] - corner[1]) / outgoingLength, (b[2] - corner[2]) / outgoingLength];
      const turn = Math.acos(Math.max(-1, Math.min(1, -(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))));
      const tangentHalf = Math.tan(turn / 2);
      const sinArc = Math.sin(turn);
      const usable = turn > 1e-4 && turn < Math.PI - 1e-4 && Math.abs(sinArc) > 1e-4;
      for (let attempt = 0; attempt <= 5 && !accepted && usable; attempt++) {
        const radiusTry = capsuleRadius + (radius - capsuleRadius) * (2 ** -attempt);
        const trim = radiusTry * tangentHalf;
        if (trim > incomingLength * 0.45 + 1e-4 || trim > outgoingLength * 0.45 + 1e-4) {continue;}
        const start: Vec3 = [corner[0] + u[0] * trim, corner[1] + u[1] * trim, corner[2] + u[2] * trim];
        const end: Vec3 = [corner[0] + v[0] * trim, corner[1] + v[1] * trim, corner[2] + v[2] * trim];
        const centerScale = radiusTry / sinArc;
        const center: Vec3 = [corner[0] + (u[0] + v[0]) * centerScale, corner[1] + (u[1] + v[1]) * centerScale, corner[2] + (u[2] + v[2]) * centerScale];
        const radialStart: Vec3 = [start[0] - center[0], start[1] - center[1], start[2] - center[2]];
        const radialEnd: Vec3 = [end[0] - center[0], end[1] - center[1], end[2] - center[2]];
        const startLength = Math.hypot(...radialStart), endLength = Math.hypot(...radialEnd);
        if (Math.abs(startLength - radiusTry) > 1e-4 || Math.abs(endLength - radiusTry) > 1e-4) {continue;}
        const curve: Vec3[] = [];
        for (let j = 1; j <= segments; j++) {
          const t = j / segments, left = Math.sin((1 - t) * turn) / sinArc, right = Math.sin(t * turn) / sinArc;
          curve.push([center[0] + left * radialStart[0] + right * radialEnd[0], center[1] + left * radialStart[1] + right * radialEnd[1], center[2] + left * radialStart[2] + right * radialEnd[2]]);
        }
        accepted = validateAppend([start, ...curve]);
      }
    }
    if (!accepted) {
      if (!validateAppend([corner])) {return null;}
    }
  }
  if (!validateAppend([points.at(-1)!])) {return null;}
  const lengths = [0];
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1]!, b = out[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  let comfortClearanceP90M: number | null = null;
  let comfortTargetMet: boolean | null = null;
  if (options.measureClearanceM) {
    const samples: number[] = [];
    const sampleCount = Math.max(1, Math.ceil(lengths.at(-1)! / 0.1));
    const clearanceSamples = Array.from({ length: sampleCount + 1 }, (_, sampleIndex): Vec3 => {
      const distance = lengths.at(-1)! * sampleIndex / sampleCount;
      let segment = 1;
      while (segment < lengths.length - 1 && lengths[segment]! < distance) {segment++;}
      const from = out[segment - 1]!, to = out[segment]!;
      const span = lengths[segment]! - lengths[segment - 1]!;
      const t = span > 0 ? (distance - lengths[segment - 1]!) / span : 0;
      return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
    });
    for (const point of clearanceSamples) {
      let measured: number | null = null;
      try { measured = options.measureClearanceM(point); } catch { measured = null; }
      if (measured !== null && Number.isFinite(measured) && measured >= 0) {samples.push(measured);}
    }
    if (samples.length === clearanceSamples.length) {
      samples.sort((left, right) => left - right);
      comfortClearanceP90M = samples[Math.ceil(samples.length * 0.9) - 1] ?? null;
      comfortTargetMet = comfortClearanceP90M !== null && comfortClearanceP90M >= 0.5;
    }
  }
  return { points: out, lengths, length: lengths.at(-1)!, comfortClearanceP90M, comfortTargetMet,
    comfortDisposition: comfortTargetMet ? 'met' : 'unavailable' };
}

const COMFORT_TARGET_M = 0.5;
const COMFORT_COMPARISON_EPSILON_M = 1e-4;

function offsetRoute(points: readonly Vec3[], offsetM: number): Vec3[] {
  const dense: Vec3[] = [];
  const distances: number[] = [];
  let routeDistance = 0;
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1]!, to = points[i]!;
    const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const subdivisions = Math.max(1, Math.ceil(length / 0.25));
    for (let step = 0; step <= subdivisions; step++) {
      if (dense.length && step === 0) {continue;}
      const t = step / subdivisions;
      dense.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]);
      distances.push(routeDistance + length * t);
    }
    routeDistance += length;
  }
  const total = routeDistance;
  return dense.map((point, i) => {
    if (i === 0 || i === dense.length - 1 || offsetM === 0) {return point;}
    const previous = dense[i - 1]!, next = dense[i + 1]!;
    const dx = next[0] - previous[0], dz = next[2] - previous[2];
    const tangentLength = Math.hypot(dx, dz);
    if (tangentLength <= COMFORT_COMPARISON_EPSILON_M) {return point;}
    const envelope = Math.min(1, distances[i]! / 0.5, (total - distances[i]!) / 0.5);
    const offset = offsetM * Math.max(0, envelope);
    return [point[0] - (dz / tangentLength) * offset, point[1], point[2] + (dx / tangentLength) * offset] as Vec3;
  });
}

/**
 * Prefer the highest measured centerline clearance among bounded lateral offsets, but
 * only after every offset and rounded chord passes the caller's swept-capsule validator.
 * Endpoints remain fixed. A failed finite search is not proof that no wider route exists.
 */
export function smoothRouteCorners(points: readonly Vec3[], options: CornerSmoothingOptions): ValidatedRoute | null {
  const base = buildValidatedRoute(points, options);
  if (!base || base.comfortClearanceP90M === null || !options.measureClearanceM) {
    return base ? { ...base, comfortDisposition: 'unavailable' } : null;
  }
  if (base.comfortClearanceP90M >= COMFORT_TARGET_M - COMFORT_COMPARISON_EPSILON_M) {
    return { ...base, comfortTargetMet: true, comfortDisposition: 'met' };
  }
  let best = base;
  let safeOffsetFound = false;
  for (let step = 1; step <= 10; step++) {
    const offsetM = step * 0.05;
    for (const sign of [-1, 1]) {
      const candidate = buildValidatedRoute(offsetRoute(points, offsetM * sign), options);
      if (!candidate || candidate.comfortClearanceP90M === null) {continue;}
      safeOffsetFound = true;
      if (best.comfortClearanceP90M !== null &&
        candidate.comfortClearanceP90M > best.comfortClearanceP90M + COMFORT_COMPARISON_EPSILON_M) {
        best = candidate;
      }
    }
  }
  if (best.comfortClearanceP90M !== null && best.comfortClearanceP90M >= COMFORT_TARGET_M - COMFORT_COMPARISON_EPSILON_M) {
    return { ...best, comfortTargetMet: true, comfortDisposition: 'met' };
  }
  if (best !== base) {
    return { ...best, comfortTargetMet: false, comfortDisposition: 'offset-improved' };
  }
  return { ...base, comfortTargetMet: false,
    comfortDisposition: safeOffsetFound ? 'no-improving-offset-found' : 'no-safe-offset-found' };
}

const MAX_ACCELERATION_MPS2 = CHARACTER_CONFIG.maxAutoAccelerationMps2;
const MAX_TURN_RATE_RAD_S = CHARACTER_CONFIG.maxYawRateDegPerSec * Math.PI / 180;
const GAZE_LEAD_SECONDS = CHARACTER_CONFIG.gazeLeadSeconds;
const EPSILON = 1e-6;

function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function nextCorner(leg: MotionLeg, distanceM: number) {
  for (let i = 1; i < leg.lengths.length - 1; i++) {
    if (leg.lengths[i]! <= distanceM + EPSILON) {continue;}
    const before = leg.points[i]!, prior = leg.points[i - 1]!, after = leg.points[i + 1]!;
    const inLength = Math.hypot(before[0] - prior[0], before[1] - prior[1], before[2] - prior[2]);
    const outLength = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
    if (inLength <= EPSILON || outLength <= EPSILON) {continue;}
    const dot = ((before[0] - prior[0]) * (after[0] - before[0]) +
      (before[1] - prior[1]) * (after[1] - before[1]) +
      (before[2] - prior[2]) * (after[2] - before[2])) / (inLength * outLength);
    const turnRadians = Math.acos(Math.max(-1, Math.min(1, dot)));
    const radiusM = turnRadians > EPSILON
      ? (inLength + outLength) / (4 * Math.sin(turnRadians / 2))
      : Number.POSITIVE_INFINITY;
    return { distanceM: leg.lengths[i]!, turnRadians, radiusM };
  }
  return null;
}

/**
 * Compute one bounded, distance-parameterized route step. This is a candidate generator,
 * not a collision resolver: the owner must sweep/validate `displacement` before applying it.
 */
export function steerRoute(input: RouteSteeringInput): RouteSteeringIntent {
  const { leg, state } = input;
  const finite = (value: number) => Number.isFinite(value);
  const monotoneLengths = leg.lengths.every((distance, index) =>
    index === 0 ? distance === 0 : distance >= leg.lengths[index - 1]!,
  );
  const validLeg = finite(leg.length) && leg.length >= 0 && finite(leg.speed) && leg.speed >= 0 &&
    leg.points.length > 0 && leg.points.every((point) => point.length === 3 && point.every(finite)) &&
    leg.lengths.length === leg.points.length && leg.lengths.every(finite) && monotoneLengths &&
    Math.abs(leg.lengths.at(-1)! - leg.length) <= EPSILON;
  const validInput = validLeg && finite(input.dtSeconds) && input.dtSeconds >= 0 &&
    finite(state.distanceM) && finite(state.speedMps) && state.speedMps >= 0 &&
    finite(state.yawRadians) && (input.speedLimitMps === undefined ||
      (finite(input.speedLimitMps) && input.speedLimitMps >= 0)) &&
    (input.timeScale === undefined || (finite(input.timeScale) && input.timeScale > 0));
  const gazeTarget: Vec3 = [0, 0, 0];
  if (!validInput) {
    return { displacement: [0, 0, 0], gazeTarget, targetYawRadians: 0,
      speedMps: 0, accelerationMps2: 0, distanceM: 0, arrived: false,
      stopped: false, blocked: true, lookaheadSeconds: CHARACTER_CONFIG.lookahead.minSeconds,
      gazeLeadSeconds: GAZE_LEAD_SECONDS };
  }
  const dt = Math.min(input.dtSeconds, 0.1);
  const timeScale = input.timeScale ?? 1;
  const currentDistance = Math.max(0, Math.min(leg.length, state.distanceM));
  const remaining = Math.max(0, leg.length - currentDistance);
  const limit = Math.max(0, input.speedLimitMps ?? CHARACTER_CONFIG.walkSpeedMps);
  const routeLimit = Math.min(limit, Math.max(0, leg.speed));
  const corner = nextCorner(leg, currentDistance);
  const slowdownStart = CHARACTER_CONFIG.cornerSlowdown.startAngleDeg * Math.PI / 180;
  const cornerSeverity = corner
    ? Math.max(0, Math.min(1, (corner.turnRadians - slowdownStart) / (Math.PI - slowdownStart)))
    : 0;
  const cornerSpeedFactor = 1 - cornerSeverity * (1 - CHARACTER_CONFIG.cornerSlowdown.minSpeedFactor);
  const distanceToCorner = corner ? Math.max(0, corner.distanceM - currentDistance) : Number.POSITIVE_INFINITY;
  // The resolved trajectory's acceleration is a vector. Curvature consumes the
  // normal component of that budget, so only the remaining magnitude is available
  // for speeding up or braking along the route.
  const worldSpeed = state.speedMps * timeScale;
  const estimatedNormalAcceleration = corner && Number.isFinite(corner.radiusM) && corner.radiusM > EPSILON
    ? Math.min(MAX_ACCELERATION_MPS2 * 0.95, (worldSpeed * worldSpeed) / corner.radiusM)
    : 0;
  const tangentialAcceleration = Math.sqrt(Math.max(
    0,
    MAX_ACCELERATION_MPS2 ** 2 - estimatedNormalAcceleration ** 2,
  ));
  const maxAcceleration = tangentialAcceleration / timeScale;
  const curvatureSpeedLimit = corner
    ? Math.sqrt(MAX_ACCELERATION_MPS2 * 0.75 * corner.radiusM) / timeScale
    : Number.POSITIVE_INFINITY;
  const turnSpeed = Math.min(routeLimit * cornerSpeedFactor, curvatureSpeedLimit);
  const cornerBrakingSpeed = Math.sqrt(
    (turnSpeed * timeScale) ** 2 + 2 * tangentialAcceleration * distanceToCorner,
  ) / timeScale;
  const brakingSpeed = Math.sqrt(2 * MAX_ACCELERATION_MPS2 * remaining) / timeScale;
  const desiredSpeed = input.stop ? 0 : Math.min(routeLimit, brakingSpeed, cornerBrakingSpeed);
  const dv = Math.max(-maxAcceleration * dt,
    Math.min(maxAcceleration * dt, desiredSpeed - Math.max(0, state.speedMps)));
  const speed = Math.max(0, state.speedMps + dv);
  const advance = Math.min(remaining, Math.max(0, (state.speedMps + speed) * 0.5 * dt * timeScale));
  const nextDistance = currentDistance + advance;
  const arrived = nextDistance >= leg.length - EPSILON && speed <= maxAcceleration * dt + EPSILON;

  const position: Vec3 = [0, 0, 0];
  sampleLeg(leg, currentDistance, position, [0, 0, 0]);
  const lookaheadSeconds = CHARACTER_CONFIG.lookahead.maxSeconds - cornerSeverity *
    (CHARACTER_CONFIG.lookahead.maxSeconds - CHARACTER_CONFIG.lookahead.minSeconds);
  const lookaheadTangent: Vec3 = [0, 0, -1];
  const lookaheadDistance = Math.min(leg.length, nextDistance + speed * timeScale * lookaheadSeconds);
  sampleLeg(leg, lookaheadDistance, [0, 0, 0], lookaheadTangent);
  const gazeDistance = Math.min(leg.length, nextDistance + speed * timeScale * GAZE_LEAD_SECONDS);
  sampleLeg(leg, gazeDistance, gazeTarget, [0, 0, 0]);

  const horizontalLength = Math.hypot(lookaheadTangent[0], lookaheadTangent[2]);
  const targetYaw = horizontalLength > EPSILON
    ? Math.atan2(-lookaheadTangent[0], -lookaheadTangent[2])
    : state.yawRadians;
  const yawError = wrapAngle(targetYaw - state.yawRadians);
  // Per-rendered-frame delta is enforced by WalkthroughLayer, which can aggregate
  // multiple physics substeps before the next visible frame. Here only enforce rate.
  const yawStepLimit = MAX_TURN_RATE_RAD_S * dt;
  const yawStep = Math.max(-yawStepLimit, Math.min(yawStepLimit, yawError));
  const yaw = state.yawRadians + yawStep;

  const nextPosition: Vec3 = [0, 0, 0];
  sampleLeg(leg, nextDistance, nextPosition, [0, 0, 0]);
  const proposedDisplacement: Vec3 = [
    nextPosition[0] - position[0],
    nextPosition[1] - position[1],
    nextPosition[2] - position[2],
  ];
  let clear = false;
  try {
    clear = input.validateDisplacement(position, proposedDisplacement) === true;
  } catch {
    // A missing or failed clearance service must never authorize movement.
    clear = false;
  }
  const displacement = clear ? proposedDisplacement : [0, 0, 0] as Vec3;
  const committedDistance = clear ? nextDistance : currentDistance;
  const committedSpeed = clear ? (arrived ? 0 : speed) : 0;
  const stopped = input.stop === true && speed <= EPSILON;

  return {
    displacement,
    gazeTarget,
    targetYawRadians: yaw,
    speedMps: committedSpeed,
    accelerationMps2: clear && dt > 0 ? (speed - state.speedMps) * timeScale / dt : 0,
    distanceM: committedDistance,
    arrived: clear && arrived,
    stopped: clear && stopped,
    blocked: !clear,
    lookaheadSeconds,
    gazeLeadSeconds: GAZE_LEAD_SECONDS,
  };
}
