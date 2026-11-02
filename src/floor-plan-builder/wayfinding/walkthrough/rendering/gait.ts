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
