import { characterConfigSchema, type CharacterConfig } from './contracts.ts';

/** The shared walk profile. Height is measured from the feet to the crown. */
export const CHARACTER_CONFIG = characterConfigSchema.parse({
  id: 'venue-human-v1',
  radiusM: 0.3,
  heightM: 1.8,
  maxStepM: 0.35,
  walkSpeedMps: 1.4,
  sprintSpeedMps: 3.2,
  accelerationMps2: 2,
  brakingMps2: 12,
  eyeHeightM: 1.6,
  gaitStrideM: 1.35,
}) satisfies CharacterConfig;

/** Rapier capsule half-height is the straight segment between the hemispheres. */
export const CAPSULE_HALF_SEGMENT_M = CHARACTER_CONFIG.heightM / 2 - CHARACTER_CONFIG.radiusM;

/** Centerline from capsule base to top: total height includes both hemispheres. */
export const CAPSULE_TOTAL_HEIGHT_M = 2 * CAPSULE_HALF_SEGMENT_M + 2 * CHARACTER_CONFIG.radiusM;
