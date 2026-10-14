import { frameRuntime } from '@/features/world/model/frame-runtime.ts';

const movementKeys = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
]);
/** Simulation-rate input/velocity, deliberately outside React snapshots. */
export const manualLocomotion = {
  keys: new Set<string>(),
  vx: 0,
  vz: 0,
  touchX: 0,
  touchZ: 0,
  setTouch(x: number, z: number) {
    if (!Number.isFinite(x + z)) {
      return;
    }
    const magnitude = Math.max(1, Math.hypot(x, z));
    this.touchX = x / magnitude;
    this.touchZ = z / magnitude;
    if (this.touchX || this.touchZ) {
      frameRuntime.wake('manual-walk', Infinity);
    }
  },
  accepts(code: string) {
    return movementKeys.has(code);
  },
  get active() {
    return (
      this.keys.has('KeyW') ||
      this.keys.has('KeyA') ||
      this.keys.has('KeyS') ||
      this.keys.has('KeyD') ||
      this.keys.has('ArrowUp') ||
      this.keys.has('ArrowLeft') ||
      this.keys.has('ArrowDown') ||
      this.keys.has('ArrowRight') ||
      Math.hypot(this.touchX, this.touchZ, this.vx, this.vz) > 0.002
    );
  },
  press(code: string) {
    this.keys.add(code);
    if (this.active) {
      frameRuntime.wake('manual-walk', Infinity);
    }
  },
  release(code: string) {
    this.keys.delete(code);
  },
  reset() {
    this.keys.clear();
    this.vx = this.vz = 0;
    this.touchX = this.touchZ = 0;
    frameRuntime.release('manual-walk');
  },
  advance(forwardX: number, forwardZ: number, seconds: number) {
    let x =
      Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
      Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    x += this.touchX;
    let z =
      Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) -
      Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    z += this.touchZ;
    const length = Math.hypot(x, z);
    if (length) {
      x /= Math.max(1, length);
      z /= Math.max(1, length);
    }
    const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 4.5 : 2.2;
    const targetX = (forwardX * z - forwardZ * x) * speed;
    const targetZ = (forwardZ * z + forwardX * x) * speed;
    if (length) {
      const dx = targetX - this.vx,
        dz = targetZ - this.vz,
        change = Math.hypot(dx, dz);
      const ratio = change ? Math.min(1, (12 * seconds) / change) : 0;
      this.vx += dx * ratio;
      this.vz += dz * ratio;
    } else {
      const friction = Math.exp(-10 * seconds);
      this.vx *= friction;
      this.vz *= friction;
      if (Math.hypot(this.vx, this.vz) < 0.002) {
        this.vx = this.vz = 0;
        frameRuntime.release('manual-walk');
      }
    }
  },
};
