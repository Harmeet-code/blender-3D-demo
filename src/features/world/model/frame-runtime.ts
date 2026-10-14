type WakeListener = () => void;
/** One canvas owns these leases. Mutations wake before starting imperative work. */
export class FrameRuntime {
  private reasons = new Map<string, number>();
  private listeners = new Set<WakeListener>();
  renderedFrames = 0;
  simulationSteps = 0;
  alpha = 0;
  generation = 0;
  private lastWake = { reason: '', at: 0 };
  wake(reason: string, durationMs = 250, now = performance.now()) {
    this.lastWake.reason = reason;
    this.lastWake.at = now;
    this.reasons.set(reason, Math.max(this.reasons.get(reason) ?? 0, now + durationMs));
    this.listeners.forEach((listener) => listener());
  }
  release(reason: string) {
    if (this.reasons.delete(reason)) {
      this.listeners.forEach((listener) => listener());
    }
  }
  active(now = performance.now()) {
    for (const [reason, deadline] of this.reasons) {
      if (deadline <= now) {
        this.reasons.delete(reason);
      }
    }
    return this.reasons.size > 0;
  }
  subscribe(listener: WakeListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  reset() {
    this.reasons.clear();
    this.generation++;
    this.alpha = 0;
  }
  snapshot() {
    const active = this.active();
    return {
      active,
      lastWake: this.lastWake.reason ? { ...this.lastWake } : null,
      frames: this.renderedFrames,
      simulationSteps: this.simulationSteps,
      reasons: [...this.reasons.keys()],
      generation: this.generation,
    };
  }
}
export const frameRuntime = new FrameRuntime();

export class FixedStepClock {
  accumulator = 0;
  readonly stepSeconds = 1 / 60;
  advance(delta: number, step: (seconds: number) => void) {
    this.accumulator += Math.min(
      4 * this.stepSeconds,
      Math.max(0, Number.isFinite(delta) ? delta : 0),
    );
    let count = 0;
    while (this.accumulator + 1e-10 >= this.stepSeconds && count < 4) {
      step(this.stepSeconds);
      this.accumulator = Math.max(0, this.accumulator - this.stepSeconds);
      count++;
    }
    return { steps: count, alpha: this.accumulator / this.stepSeconds };
  }
  reset() {
    this.accumulator = 0;
  }
}
