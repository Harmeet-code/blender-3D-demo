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
}

export interface ValidatedRoute {
  points: Vec3[];
  lengths: number[];
  length: number;
}

export interface CornerSmoothingOptions {
  /** Maximum distance trimmed from each side of a corner. */
  cornerRadiusM?: number;
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
export function smoothRouteCorners(points: readonly Vec3[], options: CornerSmoothingOptions): ValidatedRoute | null {
  const radius = options.cornerRadiusM ?? 0.25;
  const segments = options.curveSegments ?? 4;
  const valid = Number.isFinite(radius) && radius >= 0 && Number.isInteger(segments) && segments >= 1 &&
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
    const incoming = Math.hypot(corner[0] - a[0], corner[1] - a[1], corner[2] - a[2]);
    const outgoing = Math.hypot(b[0] - corner[0], b[1] - corner[1], b[2] - corner[2]);
    const maxTrim = Math.min(radius, incoming * 0.45, outgoing * 0.45);
    let trim = maxTrim;
    let accepted = false;
    for (let attempt = 0; attempt < 9 && !accepted; attempt++, trim *= 0.5) {
      if (trim <= 1e-5) {break;}
      const start: Vec3 = [
        corner[0] + (a[0] - corner[0]) * (trim / incoming),
        corner[1] + (a[1] - corner[1]) * (trim / incoming),
        corner[2] + (a[2] - corner[2]) * (trim / incoming),
      ];
      const end: Vec3 = [
        corner[0] + (b[0] - corner[0]) * (trim / outgoing),
        corner[1] + (b[1] - corner[1]) * (trim / outgoing),
        corner[2] + (b[2] - corner[2]) * (trim / outgoing),
      ];
      const curve: Vec3[] = [];
      for (let j = 1; j <= segments; j++) {
        const t = j / segments, u = 1 - t;
        curve.push([
          u * u * start[0] + 2 * u * t * corner[0] + t * t * end[0],
          u * u * start[1] + 2 * u * t * corner[1] + t * t * end[1],
          u * u * start[2] + 2 * u * t * corner[2] + t * t * end[2],
        ]);
      }
      accepted = validateAppend([start, ...curve]);
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
  return { points: out, lengths, length: lengths.at(-1)! };
}

const MAX_ACCELERATION_MPS2 = 2;
const MAX_TURN_RATE_RAD_S = Math.PI;
const GAZE_LEAD_SECONDS = 0.5;
const EPSILON = 1e-6;

function wrapAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
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
      (finite(input.speedLimitMps) && input.speedLimitMps >= 0));
  const gazeTarget: Vec3 = [0, 0, 0];
  if (!validInput) {
    return { displacement: [0, 0, 0], gazeTarget, targetYawRadians: 0,
      speedMps: 0, accelerationMps2: 0, distanceM: 0, arrived: false,
      stopped: false, blocked: true };
  }
  const dt = Math.min(input.dtSeconds, 0.1);
  const currentDistance = Math.max(0, Math.min(leg.length, state.distanceM));
  const remaining = Math.max(0, leg.length - currentDistance);
  const limit = Math.max(0, input.speedLimitMps ?? CHARACTER_CONFIG.walkSpeedMps);
  const routeLimit = Math.min(limit, Math.max(0, leg.speed));
  const brakingSpeed = Math.sqrt(2 * MAX_ACCELERATION_MPS2 * remaining);
  const desiredSpeed = input.stop ? 0 : Math.min(routeLimit, brakingSpeed);
  const dv = Math.max(-MAX_ACCELERATION_MPS2 * dt,
    Math.min(MAX_ACCELERATION_MPS2 * dt, desiredSpeed - Math.max(0, state.speedMps)));
  const speed = Math.max(0, state.speedMps + dv);
  const advance = Math.min(remaining, Math.max(0, (state.speedMps + speed) * 0.5 * dt));
  const nextDistance = currentDistance + advance;
  const arrived = nextDistance >= leg.length - EPSILON && speed <= MAX_ACCELERATION_MPS2 * dt + EPSILON;

  const position: Vec3 = [0, 0, 0];
  const tangent: Vec3 = [0, 0, -1];
  sampleLeg(leg, currentDistance, position, tangent);
  const lookahead = speed * GAZE_LEAD_SECONDS;
  sampleLeg(leg, Math.min(leg.length, nextDistance + lookahead), gazeTarget, [0, 0, 0]);

  const horizontalLength = Math.hypot(tangent[0], tangent[2]);
  const targetYaw = horizontalLength > EPSILON
    ? Math.atan2(-tangent[0], -tangent[2])
    : state.yawRadians;
  const yawError = wrapAngle(targetYaw - state.yawRadians);
  const yawStep = Math.max(-MAX_TURN_RATE_RAD_S * dt, Math.min(MAX_TURN_RATE_RAD_S * dt, yawError));
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
    accelerationMps2: clear && dt > 0 ? (speed - state.speedMps) / dt : 0,
    distanceM: committedDistance,
    arrived: clear && arrived,
    stopped: clear && stopped,
    blocked: !clear,
  };
}
