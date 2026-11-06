import type { Follower } from '../follower.ts';
import type { Vec3 } from '../path.ts';

/** Route-less pose state for manual walking; the empty path is a compatibility surface, not a route. */
export function createFreeWalkRuntime(position: Vec3, floorId: string): Follower {
  return {
    path: { legs: [], length: 0, visualLength: 0, duration: 0, ticks: [] },
    leg: 0,
    s: 0,
    distance: 0,
    progress: 0,
    ribbon: { progress: 0 },
    speed: 0,
    yaw: 0,
    yawVelocity: 0,
    position: [...position],
    tangent: [0, 0, -1],
    look: [position[0], position[1] + 1.2, position[2] - 1],
    scratch: [0, 0, 0],
    elapsed: 0,
    gaitDistance: 0,
    phase: 'Free walk',
    arrived: false,
    arrivalTime: 0,
    floorId,
    seekVersion: 0,
    lastSeek: -1,
    connector: null,
    renderCommits: 0,
  };
}
