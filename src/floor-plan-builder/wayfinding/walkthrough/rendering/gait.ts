import { CHARACTER_CONFIG } from '../character-config.ts';

export type GaitLocomotion = 'idle' | 'walk' | 'run' | 'connector' | 'blocked';

export interface GaitPose {
  phaseRadians: number;
  leftLegRadians: number;
  rightLegRadians: number;
  leftArmRadians: number;
  rightArmRadians: number;
  pelvisBobM: number;
  torsoLeanRadians: number;
}

export interface GaitInput {
  /** Cumulative resolved travel distance; never elapsed render time. */
  gaitDistanceM: number;
  locomotion: GaitLocomotion;
  speedMps: number;
  inclineRadians?: number;
  strideM?: number;
}

export interface FootPlantState {
  stance: [boolean, boolean];
  anchors: [[number, number, number], [number, number, number]];
  previousAnchors: [[number, number, number] | null, [number, number, number] | null];
  groundSpeedsMps: [number | null, number | null];
}

export interface FootPlantInput {
  /** Resolved character root position in world coordinates. */
  rootPosition: [number, number, number];
  /** Resolved ground height at the foot's touchdown point, including terrain/stairs. */
  groundY: number;
  yawRadians: number;
  phaseRadians: number;
  strideM?: number;
  stanceFraction?: number;
  /** Real elapsed interval since the previous resolved anchor sample. */
  dtSeconds?: number;
}

export function createFootPlantState(): FootPlantState {
  return { stance: [false, false], anchors: [[0, 0, 0], [0, 0, 0]], previousAnchors: [null, null], groundSpeedsMps: [null, null] };
}

/** Max measured world speed among currently planted feet; null means no valid sample. */
export function stanceFootGroundSpeedMps(state: FootPlantState): number | null {
  const speeds = state.groundSpeedsMps.filter((speed, index) => state.stance[index] && speed !== null) as number[];
  return speeds.length ? Math.max(...speeds) : null;
}

/**
 * Stateful world-space foot targets. Each anchor is captured on stance entry and held
 * until swing begins; the caller supplies resolved root/ground data and owns IK solving.
 */
export function sampleFootPlants(state: FootPlantState, input: FootPlantInput): [[number, number, number], [number, number, number]] {
  const stride = Math.max(0.1, input.strideM ?? CHARACTER_CONFIG.gaitStrideM);
  const stanceFraction = Math.max(0.1, Math.min(0.9, input.stanceFraction ?? 0.6));
  const { rootPosition: root, yawRadians: yaw, phaseRadians: phase } = input;
  const valid = root.every(Number.isFinite) && Number.isFinite(input.groundY) &&
    Number.isFinite(yaw) && Number.isFinite(phase);
  if (!valid) {return state.anchors;}
  const forwardX = -Math.sin(yaw), forwardZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
  const result: [[number, number, number], [number, number, number]] = [[0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const cycle = ((phase / (Math.PI * 2) + i * 0.5) % 1 + 1) % 1;
    const stance = cycle < stanceFraction;
    if (stance && !state.stance[i]) {
      const ahead = stride * 0.3;
      state.anchors[i] = [
        root[0] + rightX * side * 0.1 + forwardX * ahead,
        input.groundY,
        root[2] + rightZ * side * 0.1 + forwardZ * ahead,
      ];
      state.previousAnchors[i] = null;
      state.groundSpeedsMps[i] = null;
    } else if (stance) {
      const previous = state.previousAnchors[i]!;
      const dt = input.dtSeconds;
      const anchor = state.anchors[i]!;
      state.groundSpeedsMps[i] = previous && dt !== undefined && Number.isFinite(dt) && dt > 0
        ? Math.hypot(anchor[0] - previous[0], anchor[1] - previous[1], anchor[2] - previous[2]) / dt
        : null;
    }
    state.stance[i] = stance;
    if (stance) {
      const anchor = state.anchors[i]!;
      result[i] = [...anchor] as [number, number, number];
      state.previousAnchors[i] = [...anchor];
    } else {
      state.groundSpeedsMps[i] = null;
      state.previousAnchors[i] = null;
      const swing = (cycle - stanceFraction) / (1 - stanceFraction);
      // Match the stance anchor cycle: swing begins behind the root and lands
      // ahead, preserving the target position on both phase boundaries.
      const travel = stride * (-0.3 + 0.6 * swing);
      result[i] = [
        root[0] + rightX * side * 0.1 + forwardX * travel,
        input.groundY + Math.sin(swing * Math.PI) * 0.13,
        root[2] + rightZ * side * 0.1 + forwardZ * travel,
      ];
    }
  }
  return result;
}

const TWO_PI = Math.PI * 2;

/** Procedural human gait pose sampled from resolved travel distance. */
export function sampleGait(input: GaitInput): GaitPose {
  const stride = Math.max(0.1, input.strideM ?? CHARACTER_CONFIG.gaitStrideM);
  const moving = input.locomotion === 'walk' || input.locomotion === 'run';
  const phaseRadians = moving
    ? ((input.gaitDistanceM / stride) % 1) * TWO_PI
    : 0;
  const amplitude = moving
    ? Math.min(0.62, 0.34 + Math.max(0, input.speedMps) * 0.09)
    : 0;
  const legSwing = Math.sin(phaseRadians) * amplitude;
  const armSwing = -legSwing * 0.72;
  const pelvisBobM = moving ? 0.018 * (1 - Math.cos(phaseRadians * 2)) : 0;
  const incline = Math.max(-0.45, Math.min(0.45, input.inclineRadians ?? 0));

  return {
    phaseRadians,
    leftLegRadians: legSwing,
    rightLegRadians: -legSwing,
    leftArmRadians: armSwing,
    rightArmRadians: -armSwing,
    pelvisBobM,
    torsoLeanRadians: moving ? -incline * 0.35 : 0,
  };
}
