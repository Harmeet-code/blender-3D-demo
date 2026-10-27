import type { MotionLeg, Vec3, WalkPath } from './path.ts';
import { doorEase, distance3, sampleLeg } from './path.ts';
import { circulationDesign } from '../../model/circulation.ts';

export interface Follower {
  path: WalkPath;
  leg: number;
  s: number;
  distance: number;
  progress: number;
  ribbon: { progress: number };
  speed: number;
  yaw: number;
  yawVelocity: number;
  position: Vec3;
  tangent: Vec3;
  look: Vec3;
  scratch: Vec3;
  elapsed: number;
  gaitDistance: number;
  phase: string;
  arrived: boolean;
  arrivalTime: number;
  floorId: string;
  seekVersion: number;
  lastSeek: number;
  connector: { portalId: string; cabinY: number; open: number } | null;
  renderCommits: number;
}
export function createFollower(path: WalkPath): Follower {
  const leg = path.legs[0]!;
  const value: Follower = {
    path,
    leg: 0,
    s: 0,
    distance: 0,
    progress: 0,
    ribbon: { progress: 0 },
    speed: 0,
    yaw: 0,
    yawVelocity: 0,
    position: [...leg.points[0]!],
    tangent: [0, 0, -1],
    look: [0, 0, 0],
    scratch: [0, 0, 0],
    elapsed: 0,
    gaitDistance: 0,
    phase: 'Ready',
    arrived: false,
    arrivalTime: 0,
    floorId: leg.floorId,
    seekVersion: 0,
    lastSeek: -1,
    connector: null,
    renderCommits: 0,
  };
  sampleLeg(leg, 0, value.position, value.tangent);
  value.yaw = Math.atan2(-value.tangent[0], -value.tangent[2]);
  return value;
}
function elevator(value: Follower, leg: MotionLeg) {
  const a = leg.points[0]!,
    inside = leg.points[1]!,
    upper = leg.points[2]!,
    b = leg.points.at(-1)!;
  const board = distance3(a, inside) / 1.2,
    ride = distance3(inside, upper) / 1.5,
    exit = distance3(upper, b) / 1.2;
  const d = 1.2,
    sourceY = a[1] - leg.baseY,
    destY = b[1] - leg.baseY;
  const initialY =
    leg.connector && circulationDesign(leg.connector).cabinLevel === 'upper'
      ? leg.connector.dimensions[1]
      : 0;
  const call = Math.abs(initialY - sourceY) > 0.01 ? d + Math.abs(initialY - sourceY) / 1.5 : 0;
  const t = value.elapsed - call;
  const initialOpen = leg.connector && circulationDesign(leg.connector).doorsOpen ? 1 : 0;
  if (t < 0) {
    [value.position[0], value.position[1], value.position[2]] = a;
    value.phase = 'Elevator · calling cabin';
    value.s = 0;
    const travel = Math.max(0, Math.min(1, (value.elapsed - d) / Math.max(0.001, call - d)));
    value.connector ??= { portalId: leg.connector?.portalId ?? '', cabinY: 0, open: 0 };
    value.connector.cabinY = initialY + (sourceY - initialY) * travel;
    value.connector.open = initialOpen * Math.max(0, 1 - doorEase(Math.min(1, value.elapsed / d)));
    return false;
  }
  let ratio = 0,
    from = a,
    to = inside,
    open = 1,
    cabin = sourceY;
  if (t < d) {
    value.phase = 'Elevator · opening doors';
    ratio = 0;
    const startOpen = call > 0 ? 0 : initialOpen;
    open = startOpen + (1 - startOpen) * doorEase(t / d);
  } else if (t < d + board) {
    value.phase = 'Elevator · boarding';
    ratio = (t - d) / Math.max(0.001, board);
  } else if (t < 2 * d + board) {
    value.phase = 'Elevator · closing doors';
    from = inside;
    to = inside;
    open = 1 - doorEase((t - d - board) / d);
  } else if (t < 2 * d + board + ride) {
    value.phase = 'Elevator · riding';
    from = inside;
    to = upper;
    ratio = (t - 2 * d - board) / Math.max(0.001, ride);
    open = 0;
    cabin = sourceY + (destY - sourceY) * ratio;
  } else if (t < 3 * d + board + ride) {
    value.phase = 'Elevator · opening at destination';
    from = upper;
    to = upper;
    open = doorEase((t - 2 * d - board - ride) / d);
    cabin = destY;
  } else {
    value.phase = 'Elevator · exiting';
    from = upper;
    to = b;
    ratio = Math.min(1, (t - 3 * d - board - ride) / Math.max(0.001, exit));
    cabin = destY;
    value.floorId = leg.toFloorId ?? leg.floorId;
  }
  const [oldX, , oldZ] = value.position;
  for (let axis = 0; axis < 3; axis++) {
    value.position[axis] = from[axis]! + (to[axis]! - from[axis]!) * ratio;
  }
  const length = Math.max(1e-5, distance3(from, to));
  for (let axis = 0; axis < 3; axis++) {
    value.tangent[axis] = (to[axis]! - from[axis]!) / length;
  }
  if (Math.hypot(value.tangent[0], value.tangent[2]) < 0.01) {
    const facingFrom = t >= 3 * d + board + ride ? upper : a;
    const facingTo = t >= 3 * d + board + ride ? b : inside;
    const horizontalLength = Math.max(
      1e-6,
      Math.hypot(facingTo[0] - facingFrom[0], facingTo[2] - facingFrom[2]),
    );
    value.tangent[0] = (facingTo[0] - facingFrom[0]) / horizontalLength;
    value.tangent[2] = (facingTo[2] - facingFrom[2]) / horizontalLength;
  }
  value.look[0] = value.position[0] + value.tangent[0] * 0.8;
  const [, height] = value.position;
  value.look[1] = height;
  value.look[2] = value.position[2] + value.tangent[2] * 0.8;
  value.gaitDistance += Math.hypot(value.position[0] - oldX, value.position[2] - oldZ);
  value.s =
    t < d
      ? 0
      : t < d + board
        ? distance3(a, inside) * ratio
        : t < 2 * d + board
          ? distance3(a, inside)
          : t < 2 * d + board + ride
            ? distance3(a, inside) + distance3(inside, upper) * ratio
            : t < 3 * d + board + ride
              ? distance3(a, inside) + distance3(inside, upper)
              : distance3(a, inside) + distance3(inside, upper) + distance3(upper, b) * ratio;
  value.connector ??= { portalId: leg.connector?.portalId ?? '', cabinY: 0, open: 0 };
  value.connector.portalId = leg.connector?.portalId ?? '';
  value.connector.cabinY = cabin;
  value.connector.open = open;
  return t >= 3 * d + board + ride + exit;
}

/** Exact critically damped angular spring, including wrap-around. */
function turn(value: Follower, target: number, dt: number) {
  const error = Math.atan2(Math.sin(value.yaw - target), Math.cos(value.yaw - target)),
    omega = 14;
  const c = value.yawVelocity + omega * error,
    decay = Math.exp(-omega * dt);
  value.yaw = target + (error + c * dt) * decay;
  value.yawVelocity = (value.yawVelocity - omega * c * dt) * decay;
}
export function advanceFollower(value: Follower, dt: number) {
  if (value.arrived) {
    value.arrivalTime += dt;
    value.speed = 0;
    return;
  }
  const [beforeX, , beforeZ] = value.position;
  const leg = value.path.legs[value.leg]!;
  let done = false;
  value.elapsed += dt;
  if (leg.kind === 'elevator') {
    done = elevator(value, leg);
  } else {
    value.connector = null;
    sampleLeg(leg, Math.min(leg.length, value.s + 0.8), value.look, value.scratch);
    const dot = value.tangent[0] * value.scratch[0] + value.tangent[2] * value.scratch[2];
    const corner = leg.kind === 'walk' ? 0.7 + 0.3 * Math.max(0, dot) : 1;
    const edge =
      leg.kind === 'walk'
        ? Math.min(
            1,
            Math.sqrt(Math.max(0.03, value.s) * 2) / 1.2,
            Math.sqrt(Math.max(0.03, leg.length - value.s) * 2) / 1.2,
          )
        : 1;
    value.s = Math.min(leg.length, value.s + leg.speed * corner * edge * dt);
    sampleLeg(leg, value.s, value.position, value.tangent);
    if (leg.kind !== 'escalator') {
      value.gaitDistance += Math.hypot(value.position[0] - beforeX, value.position[2] - beforeZ);
    }
    value.phase =
      leg.kind === 'stairs'
        ? 'Climbing stairs'
        : leg.kind === 'ramp'
          ? 'Following ramp'
          : leg.kind === 'escalator'
            ? 'Riding escalator'
            : 'Walking';
    done = value.s >= leg.length - 1e-5;
  }
  const horizontal = Math.hypot(value.position[0] - beforeX, value.position[2] - beforeZ);
  value.speed = horizontal / Math.max(dt, 1e-6);
  if (Math.hypot(value.tangent[0], value.tangent[2]) > 0.01) {
    turn(value, Math.atan2(-value.tangent[0], -value.tangent[2]), dt);
  }
  value.distance = leg.offset + value.s;
  value.progress = value.path.length > 0 ? value.distance / value.path.length : 1;
  value.ribbon.progress =
    value.path.visualLength > 0
      ? (leg.visualOffset + leg.visualLength * (leg.length > 0 ? value.s / leg.length : 1)) /
        value.path.visualLength
      : 1;
  if (done) {
    if (value.leg === value.path.legs.length - 1) {
      value.arrived = true;
      value.phase = 'Arrived';
      value.progress = 1;
      value.ribbon.progress = 1;
      value.speed = 0;
      value.floorId = leg.toFloorId ?? leg.floorId;
    } else {
      value.leg++;
      value.s = 0;
      value.elapsed = 0;
      value.floorId = value.path.legs[value.leg]!.floorId;
      value.seekVersion++;
    }
  }
}

export function seekFollower(value: Follower, progress: number) {
  const distance = Math.min(1, Math.max(0, progress)) * value.path.length;
  const index = Math.max(
    0,
    value.path.legs.findIndex((leg) => distance <= leg.offset + leg.length + 1e-6),
  );
  value.leg = index;
  value.s = Math.max(0, distance - value.path.legs[index]!.offset);
  value.elapsed = 0;
  const leg = value.path.legs[index]!;
  value.floorId = leg.floorId;
  if (leg.kind === 'elevator') {
    const a = leg.points[0]!,
      inside = leg.points[1]!,
      upper = leg.points[2]!;
    const board = distance3(a, inside),
      ride = distance3(inside, upper);
    const initialY =
      leg.connector && circulationDesign(leg.connector).cabinLevel === 'upper'
        ? leg.connector.dimensions[1]
        : 0;
    const call =
      Math.abs(initialY - (a[1] - leg.baseY)) > 0.01
        ? 1.2 + Math.abs(initialY - (a[1] - leg.baseY)) / 1.5
        : 0;
    value.elapsed =
      value.s <= 0
        ? 0
        : call +
          (value.s < board
            ? 1.2 + value.s / 1.2
            : value.s < board + ride
              ? 2.4 + board / 1.2 + (value.s - board) / 1.5
              : 3.6 + board / 1.2 + ride / 1.5 + (value.s - board - ride) / 1.2);
    elevator(value, leg);
  } else {
    value.connector = null;
    sampleLeg(leg, value.s, value.position, value.tangent);
  }
  value.distance = distance;
  value.progress = progress;
  value.ribbon.progress =
    value.path.visualLength > 0
      ? (leg.visualOffset + leg.visualLength * (leg.length > 0 ? value.s / leg.length : 1)) /
        value.path.visualLength
      : 1;
  value.gaitDistance = distance;
  value.speed = 0;
  value.arrived = progress >= 1;
  if (value.arrived) {
    value.phase = 'Arrived';
  } else if (leg.kind !== 'elevator') {
    value.phase =
      leg.kind === 'walk'
        ? 'Walking'
        : leg.kind === 'escalator'
          ? 'Riding escalator'
          : leg.kind === 'stairs'
            ? 'Climbing stairs'
            : 'Following ramp';
  }
  value.arrivalTime = 0;
  if (leg.toFloorId && value.s >= leg.length) {
    value.floorId = leg.toFloorId;
  }
  value.yaw = Math.atan2(-value.tangent[0], -value.tangent[2]);
  value.yawVelocity = 0;
  value.seekVersion++;
}
