import type { AvatarState } from '../../building/model/building-schema.ts';

function shortestAngleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) {
    delta -= Math.PI * 2;
  } else if (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}

/**
 * Blend one avatar snapshot toward another. Positions lerp linearly, yaw takes
 * the shortest angular path, and floor/identity follow the target snapshot.
 */
export function interpolateAvatar(from: AvatarState, to: AvatarState, t: number): AvatarState {
  const clamped = Math.min(1, Math.max(0, t));
  return {
    id: to.id,
    position: [
      from.position[0] + (to.position[0] - from.position[0]) * clamped,
      from.position[1] + (to.position[1] - from.position[1]) * clamped,
      from.position[2] + (to.position[2] - from.position[2]) * clamped,
    ],
    rotationY: from.rotationY + shortestAngleDelta(from.rotationY, to.rotationY) * clamped,
    floorId: to.floorId,
    animationState: to.animationState,
  };
}
