import { CHARACTER_CONFIG } from '../../../wayfinding/walkthrough/character-config.ts';
import { validateCapsuleEndpoint, validateCapsuleSweep, type CollisionMap, type CollisionPolygon, type Point3 } from '../../../wayfinding/walkthrough/collision/capsule-clearance.ts';
import { sampleFootPlants, sampleGait, createFootPlantState } from '../../../wayfinding/walkthrough/rendering/gait.ts';
import { steerRoute } from '../../../wayfinding/walkthrough/steering/route-steering.ts';
import type { MotionLeg, Vec3 } from '../../../wayfinding/walkthrough/path.ts';
import { telemetryFrameSchema, type Role } from '../../../wayfinding/walkthrough/contracts.ts';
import type { MotionLabTelemetry } from './TelemetryProbe.tsx';

export const MOTION_LAB_DT = 1 / 30;
export const MOTION_LAB_FLOOR_ID = 'motion-lab-floor-1';
export type LabObstacle = { minX: number; maxX: number; minZ: number; maxZ: number };
export type LabFixture = {
  id: string;
  label: string;
  points: Vec3[];
  obstacles: LabObstacle[];
  expectedOutcome: 'clear' | 'blocked';
};

export type FixtureSummary = {
  fixtureId: string;
  actualOutcome: 'clear' | 'blocked';
  expectedOutcome: 'clear' | 'blocked';
  routeMeters: number;
  resolvedMeters: number;
  elapsedSeconds: number;
  frameCount: number;
  stopTick: number | null;
  maxAccelerationMps2: number;
  maxJerkMps3: number;
  lastClearance: { clear: boolean; blockerId?: string; source?: string };
  endpoint: { clear: boolean; blockerId?: string; source?: string };
  frames: MotionLabTelemetry[];
};

export const STANDARD_ROUTE_FIXTURES: LabFixture[] = [
  { id: 'straight-clear', label: 'Straight clear corridor', points: [[-7, 0, 0], [7, 0, 0]], obstacles: [], expectedOutcome: 'clear' },
  { id: 'wall-blocked', label: 'Wall blocks direct route', points: [[-7, 0, 0], [7, 0, 0]], obstacles: [{ minX: -0.4, maxX: 0.4, minZ: -1.4, maxZ: 1.4 }], expectedOutcome: 'blocked' },
  { id: 'authored-detour', label: 'Authored detour clears wall', points: [[-7, 0, 0], [-7, 0, 3], [7, 0, 3], [7, 0, 0]], obstacles: [{ minX: -0.4, maxX: 0.4, minZ: -1.4, maxZ: 1.4 }], expectedOutcome: 'clear' },
  { id: 'narrow-gap', label: 'Gap narrower than capsule diameter', points: [[-7, 0, 0], [7, 0, 0]], obstacles: [{ minX: -1.5, maxX: 1.5, minZ: -1.4, maxZ: -0.24 }, { minX: -1.5, maxX: 1.5, minZ: 0.24, maxZ: 1.4 }], expectedOutcome: 'blocked' },
];

export function fixtureCollisionMap(obstacles: readonly LabObstacle[]): CollisionMap {
  const collisionObstacles: CollisionPolygon[] = obstacles.map((obstacle, index) => ({
    id: `fixture-obstacle-${index + 1}`,
    source: 'authored-obstacle',
    polygon: [[obstacle.minX, obstacle.minZ], [obstacle.maxX, obstacle.minZ], [obstacle.maxX, obstacle.maxZ], [obstacle.minX, obstacle.maxZ]],
    minY: 0,
    maxY: 3,
  }));
  return {
    floorId: MOTION_LAB_FLOOR_ID,
    floorY: 0,
    boundary: [[-9, -5], [9, -5], [9, 5], [-9, 5]],
    obstacles: collisionObstacles,
    blockedAreas: [],
    roleAreas: [],
    unsupported: [],
  };
}

function makeLeg(points: Vec3[]): MotionLeg {
  const lengths = [0];
  for (let index = 1; index < points.length; index++) {
    lengths.push(lengths[index - 1]! + Math.hypot(points[index]![0] - points[index - 1]![0], points[index]![1] - points[index - 1]![1], points[index]![2] - points[index - 1]![2]));
  }
  const length = lengths.at(-1) ?? 0;
  return { kind: 'walk', floorId: MOTION_LAB_FLOOR_ID, baseY: 0, points, lengths, length, offset: 0, visualOffset: 0, visualLength: length, treads: [], speed: CHARACTER_CONFIG.walkSpeedMps };
}

const magnitude = (vector: Vec3) => Math.hypot(...vector);

export function simulateSharedRoute(fixture: LabFixture, role: Role = 'visitor'): FixtureSummary {
  const map = fixtureCollisionMap(fixture.obstacles);
  const leg = makeLeg(fixture.points);
  let position: Vec3 = [...fixture.points[0]!];
  let distanceM = 0;
  let speedMps = 0;
  let yawRadians = 0;
  let traveledMeters = 0;
  let elapsedSeconds = 0;
  let maxAccelerationMps2 = 0;
  let maxJerkMps3 = 0;
  let previousVelocity: Vec3 = [0, 0, 0];
  let previousAcceleration: Vec3 = [0, 0, 0];
  let stopped = false;
  let arrived = false;
  let stopTick: number | null = null;
  let lastClearance = validateCapsuleEndpoint(map, role, position as Point3, CHARACTER_CONFIG);
  const frames: MotionLabTelemetry[] = [];
  const footState = createFootPlantState();
  const maxTicks = Math.ceil(leg.length / CHARACTER_CONFIG.walkSpeedMps / MOTION_LAB_DT) * 8 + 100;

  for (let tick = 0; tick < maxTicks; tick++) {
    let candidateClearance = lastClearance;
    const intent = steerRoute({
      leg,
      state: { distanceM, speedMps, yawRadians },
      dtSeconds: MOTION_LAB_DT,
      speedLimitMps: CHARACTER_CONFIG.walkSpeedMps,
      validateDisplacement: (from, displacement) => {
        const to: Vec3 = [from[0] + displacement[0], from[1] + displacement[1], from[2] + displacement[2]];
        candidateClearance = validateCapsuleSweep(map, role, from as Point3, to as Point3, CHARACTER_CONFIG);
        return candidateClearance.clear;
      },
    });
    if (intent.blocked) {
      stopped = true;
      stopTick = tick;
      lastClearance = candidateClearance;
      elapsedSeconds += MOTION_LAB_DT;
      const frame = telemetryFrameSchema.parse({ tick, dtSeconds: MOTION_LAB_DT, floorId: MOTION_LAB_FLOOR_ID, position, velocity: [0, 0, 0], yawRadians, traveledMeters, gaitDistanceMeters: traveledMeters, locomotion: 'blocked' });
      frames.push({ frame, accelerationMps2: [0, 0, 0], jerkMps3: [0, 0, 0], gazeDirection: [0, 0, -1], feet: { left: [...position], right: [...position], stance: [false, false], basis: 'idle-foot-origin' }, clearance: { clear: false, blockerId: candidateClearance.blockerId, source: candidateClearance.source, reason: candidateClearance.reason, numericMarginM: null }, floorInteraction: { floorId: MOTION_LAB_FLOOR_ID, elevationM: 0, connectorPhase: null }, contactBasis: 'gait-phase-estimate-not-physics-contact' });
      break;
    }

    const previous = position;
    position = [previous[0] + intent.displacement[0], previous[1] + intent.displacement[1], previous[2] + intent.displacement[2]];
    const delta: Vec3 = [position[0] - previous[0], position[1] - previous[1], position[2] - previous[2]];
    const velocity: Vec3 = [delta[0] / MOTION_LAB_DT, delta[1] / MOTION_LAB_DT, delta[2] / MOTION_LAB_DT];
    const acceleration: Vec3 = [(velocity[0] - previousVelocity[0]) / MOTION_LAB_DT, (velocity[1] - previousVelocity[1]) / MOTION_LAB_DT, (velocity[2] - previousVelocity[2]) / MOTION_LAB_DT];
    const jerk: Vec3 = [(acceleration[0] - previousAcceleration[0]) / MOTION_LAB_DT, (acceleration[1] - previousAcceleration[1]) / MOTION_LAB_DT, (acceleration[2] - previousAcceleration[2]) / MOTION_LAB_DT];
    traveledMeters += magnitude(delta);
    distanceM = intent.distanceM;
    speedMps = intent.speedMps;
    yawRadians = intent.targetYawRadians;
    elapsedSeconds += MOTION_LAB_DT;
    maxAccelerationMps2 = Math.max(maxAccelerationMps2, magnitude(acceleration));
    maxJerkMps3 = Math.max(maxJerkMps3, magnitude(jerk));
    lastClearance = candidateClearance;
    const gazeVector: Vec3 = [intent.gazeTarget[0] - position[0], intent.gazeTarget[1] - position[1], intent.gazeTarget[2] - position[2]];
    const gazeMagnitude = magnitude(gazeVector);
    const gazeDirection: Vec3 = gazeMagnitude > 1e-8 ? [gazeVector[0] / gazeMagnitude, gazeVector[1] / gazeMagnitude, gazeVector[2] / gazeMagnitude] : [0, 0, -1];
    const gait = sampleGait({ gaitDistanceM: traveledMeters, locomotion: speedMps > 0.02 ? 'walk' : 'idle', speedMps });
    const feet = sampleFootPlants(footState, { rootPosition: position, groundY: 0, yawRadians, phaseRadians: gait.phaseRadians });
    const frame = telemetryFrameSchema.parse({ tick, dtSeconds: MOTION_LAB_DT, floorId: MOTION_LAB_FLOOR_ID, position, velocity, yawRadians, traveledMeters, gaitDistanceMeters: traveledMeters, locomotion: speedMps > 0.02 ? 'walk' : 'idle' });
    frames.push({ frame, accelerationMps2: acceleration, jerkMps3: jerk, gazeDirection, feet: { left: feet[0], right: feet[1], stance: [...footState.stance], basis: 'shared-gait-phase-estimate' }, clearance: { clear: candidateClearance.clear, blockerId: candidateClearance.blockerId, source: candidateClearance.source, reason: candidateClearance.reason, numericMarginM: null }, floorInteraction: { floorId: MOTION_LAB_FLOOR_ID, elevationM: 0, connectorPhase: null }, contactBasis: 'gait-phase-estimate-not-physics-contact' });
    previousVelocity = velocity;
    previousAcceleration = acceleration;
    if (intent.arrived) { arrived = true; break; }
  }

  if (!arrived && !stopped) {
    stopped = true;
    stopTick = frames.length;
  }
  const endpoint = validateCapsuleEndpoint(map, role, position as Point3, CHARACTER_CONFIG);
  return {
    fixtureId: fixture.id,
    actualOutcome: stopped ? 'blocked' : 'clear',
    expectedOutcome: fixture.expectedOutcome,
    routeMeters: leg.length,
    resolvedMeters: traveledMeters,
    elapsedSeconds,
    frameCount: frames.length,
    stopTick,
    maxAccelerationMps2,
    maxJerkMps3,
    lastClearance: { clear: lastClearance.clear, blockerId: lastClearance.blockerId, source: lastClearance.source },
    endpoint: { clear: endpoint.clear, blockerId: endpoint.blockerId, source: endpoint.source },
    frames,
  };
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

export function runSharedRouteFuzzer(seed: number, count = 32) {
  const random = seededRandom(seed);
  let clear = 0;
  let blocked = 0;
  let mismatches = 0;
  const examples: FixtureSummary[] = [];
  for (let index = 0; index < count; index++) {
    const start: Vec3 = [-7, 0, -3 + random() * 6];
    const end: Vec3 = [7, 0, -3 + random() * 6];
    const bends = index % 3 === 0;
    const mid: Vec3 = [random() * 4 - 2, 0, random() * 5 - 2.5];
    const points = bends ? [start, mid, end] : [start, end];
    const expectedOutcome = index % 2 === 0 ? 'blocked' : 'clear';
    const obstacleZ = bends ? mid[2] : (start[2] + end[2]) / 2;
    const offset = expectedOutcome === 'clear' ? 7 : 0;
    const halfWidth = 0.2 + random() * 0.7;
    const halfDepth = 0.2 + random() * 0.7;
    const obstacle: LabObstacle = { minX: mid[0] - halfWidth, maxX: mid[0] + halfWidth, minZ: obstacleZ + offset - halfDepth, maxZ: obstacleZ + offset + halfDepth };
    const summary = simulateSharedRoute({ id: `seed-${seed}-case-${index}`, label: bends ? 'bent' : 'direct', points, obstacles: [obstacle], expectedOutcome });
    if (summary.actualOutcome === 'clear') clear++; else blocked++;
    if (summary.actualOutcome !== expectedOutcome) mismatches++;
    if (examples.length < 4) examples.push(summary);
  }
  return { seed, count, clear, blocked, mismatches, examples, limitation: 'The generator exercises authored 2D single-floor walk paths only; connector/floor/interaction states are not fuzzed.' };
}
