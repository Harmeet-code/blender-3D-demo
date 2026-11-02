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
}

const MAX_ACCELERATION_MPS2 = 2;
const MAX_TURN_RATE_RAD_S = Math.PI;
const LOOKAHEAD_MIN_M = 0.55;
const LOOKAHEAD_MAX_M = 1.6;
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
  const dt = Math.max(0, Math.min(input.dtSeconds, 0.1));
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
  const gazeTarget: Vec3 = [0, 0, 0];
  sampleLeg(leg, currentDistance, position, tangent);
  const lookahead = Math.min(LOOKAHEAD_MAX_M, Math.max(LOOKAHEAD_MIN_M, speed * 0.8));
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
  const displacement: Vec3 = [
    nextPosition[0] - position[0],
    nextPosition[1] - position[1],
    nextPosition[2] - position[2],
  ];
  const stopped = input.stop === true && speed <= EPSILON;

  return {
    displacement,
    gazeTarget,
    targetYawRadians: yaw,
    speedMps: arrived ? 0 : speed,
    accelerationMps2: dt > 0 ? (speed - Math.max(0, state.speedMps)) / dt : 0,
    distanceM: nextDistance,
    arrived,
    stopped,
  };
}
