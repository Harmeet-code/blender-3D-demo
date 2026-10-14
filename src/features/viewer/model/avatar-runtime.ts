import type { AvatarState } from '@/features/building/model/building-schema.ts';

export type Position = [number, number, number];
export interface AvatarRoute {
  destinationId: string;
  waypoints: readonly Position[];
  floors?: readonly string[];
}
/** Resolves a displacement against the world, writing into a reusable output. */
export type MovementResolver = (desired: Position, current: Position, output: Position) => void;

/** Owns simulation-rate pose and cursor. React snapshots never own route progress. */
export class AvatarRuntime {
  readonly position: Position = [0, 0, 0];
  readonly desired: Position = [0, 0, 0];
  readonly resolved: Position = [0, 0, 0];
  floorId = 'F1';
  rotationY = 0;
  route: AvatarRoute | null = null;
  cursor = 0;
  commandVersion = 0;
  blockedSeconds = 0;
  snapshotSeconds = 0;
  carryDistance = 0;
  manualMoving = false;

  synchronize(avatar: AvatarState) {
    this.position[0] = avatar.position[0];
    this.position[1] = avatar.position[1];
    this.position[2] = avatar.position[2];
    this.floorId = avatar.floorId;
    this.rotationY = avatar.rotationY;
    this.commandVersion++;
  }

  setRoute(route: AvatarRoute | null) {
    this.route = route;
    this.cursor = 0;
    this.blockedSeconds = 0;
    this.snapshotSeconds = 0;
    this.carryDistance = 0;
  }

  /** No slicing, shifting, vectors or pose allocations in the simulation loop. */
  advance(distance: number, resolve?: MovementResolver) {
    if (!this.route || !Number.isFinite(distance) || distance < 0) {
      return;
    }
    distance += this.carryDistance;
    this.carryDistance = 0;
    while (this.cursor < this.route.waypoints.length) {
      const target = this.route.waypoints[this.cursor]!;
      const targetFloor = this.route.floors?.[this.cursor] ?? this.floorId;
      if (targetFloor !== this.floorId) {
        // Portal edges are explicit transfers; never sweep a walking body through slabs.
        this.position[0] = target[0];
        this.position[1] = target[1];
        this.position[2] = target[2];
        this.floorId = targetFloor;
        this.commandVersion++;
        this.cursor++;
        return;
      }
      const dx = target[0] - this.position[0];
      // Same-floor navigation is horizontal. The character controller owns
      // ground separation, which must not create an unreachable vertical waypoint.
      const dy = resolve ? 0 : target[1] - this.position[1];
      const dz = target[2] - this.position[2];
      const remaining = Math.hypot(dx, dy, dz);
      if (remaining < 0.0001) {
        this.cursor++;
        continue;
      }
      if (distance <= 0) {
        return;
      }
      const amount = Math.min(distance, remaining);
      const ratio = amount / remaining;
      this.desired[0] = dx * ratio;
      this.desired[1] = dy * ratio;
      this.desired[2] = dz * ratio;
      if (Math.hypot(dx, dz) > 0.001) {
        this.rotationY = Math.atan2(dx, dz);
      }
      if (resolve) {
        resolve(this.desired, this.position, this.resolved);
      } else {
        this.resolved[0] = this.desired[0];
        this.resolved[1] = this.desired[1];
        this.resolved[2] = this.desired[2];
      }
      this.position[0] += this.resolved[0];
      this.position[1] += this.resolved[1];
      this.position[2] += this.resolved[2];
      const error = Math.hypot(
        this.resolved[0] - this.desired[0],
        resolve ? 0 : this.resolved[1] - this.desired[1],
        this.resolved[2] - this.desired[2],
      );
      if (error > 0.0001) {
        this.blockedSeconds += amount / 3;
        return;
      }
      this.blockedSeconds = 0;
      distance -= amount;
      if (amount >= remaining) {
        this.cursor++;
        if (resolve && distance > 0) {
          // The collider query uses the current physics pose. Resolve the next turn
          // after the world steps, carrying its budget instead of cutting a corner.
          this.carryDistance = distance;
          return;
        }
      } else {
        return;
      }
    }
  }

  get arrived() {
    return this.route !== null && this.cursor >= this.route.waypoints.length;
  }

  snapshot(base: AvatarState): AvatarState {
    return {
      ...base,
      position: [...this.position],
      floorId: this.floorId,
      rotationY: this.rotationY,
      animationState: (this.route && !this.arrived) || this.manualMoving ? 'walk' : 'idle',
    };
  }
}

export const avatarRuntime = new AvatarRuntime();
