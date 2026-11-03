import type { WalkLocalActions } from './local-actions.ts';
import type { InteractionDescriptor, InteractionState, Role } from '../contracts.ts';
import { checkWalkUseAccess, type WalkUseHandlerPolicy } from '../foundation/role-policy.ts';

export interface InteractionTarget extends InteractionDescriptor {
  position: readonly [number, number, number];
  /** Local role gate for inspect and door behavior. */
  allowedRoles?: readonly Role[];
}

export interface InteractionRuntimeOptions {
  role: Role;
  localActions?: WalkLocalActions;
  targets: readonly InteractionTarget[];
  handlers?: readonly WalkUseHandlerPolicy[];
  onInspect?: (target: InteractionTarget) => void | Promise<void>;
  onDoorEffect?: (target: InteractionTarget, open: boolean) => void;
  onState?: (state: InteractionState) => void;
}

export interface InteractionPose {
  position: readonly [number, number, number];
  /** Radians. Forward follows the walker's -Z-at-zero convention. */
  yawRadians: number;
}

/** Stateful near-field selector. Call update from the runtime frame after resolving motion. */
export class ProximityInteractionRuntime {
  readonly localActions?: WalkLocalActions;
  private readonly role: Role;
  private readonly targets: readonly InteractionTarget[];
  private readonly handlers: readonly WalkUseHandlerPolicy[];
  private readonly onInspect?: InteractionRuntimeOptions['onInspect'];
  private readonly onDoorEffect?: InteractionRuntimeOptions['onDoorEffect'];
  private readonly onState?: InteractionRuntimeOptions['onState'];
  private focused: InteractionTarget | null = null;
  private readonly activeEffects = new Map<string, InteractionTarget>();
  private dwellMs = 0;
  private inFlight = false;
  private pendingCapability: string | undefined;
  private pendingTargetId: string | undefined;
  private current: InteractionState = { status: 'idle' };

  constructor(options: InteractionRuntimeOptions) {
    this.role = options.role;
    this.targets = options.targets;
    this.localActions = options.localActions;
    this.handlers = [...(options.handlers ?? []), ...(options.localActions?.handlers() ?? [])];
    this.onInspect = options.onInspect;
    this.onDoorEffect = options.onDoorEffect;
    this.onState = options.onState;
  }

  get state(): InteractionState { return this.current; }
  get target(): InteractionTarget | null { return this.focused; }
  get confirmationCapability(): string | undefined { return this.pendingCapability; }
  get isBusy(): boolean { return this.inFlight; }

  canUse(capability?: string): boolean {
    return this.useUnavailableReason(capability) === null;
  }

  useUnavailableReason(capability?: string): string | null {
    if (!this.focused) {return 'No target is focused.';}
    if (this.focused.allowedRoles && !this.focused.allowedRoles.includes(this.role)) {return 'Target role policy denies use.';}
    if (capability === 'call-elevator' && !this.localActions) {return 'Elevator ride unavailable: physical connector integration is missing.';}
    const localReason = capability && this.localActions?.unavailable(this.focused, capability);
    if (localReason) {return localReason;}
    const result = checkWalkUseAccess(this.role, this.focused, capability, this.handlers, true);
    return result.allowed ? null : result.reason;
  }

  update(pose: InteractionPose, dtSeconds: number): InteractionState {
    const dtMs = Math.max(0, Math.min(250, Number.isFinite(dtSeconds) ? dtSeconds * 1000 : 0));
    const [x, y, z] = pose.position;
    const forwardX = -Math.sin(pose.yawRadians);
    const forwardZ = -Math.cos(pose.yawRadians);
    const distances = this.targets.flatMap((target) => {
      if (target.allowedRoles && !target.allowedRoles.includes(this.role)) {return [];}
      const dx = target.position[0] - x;
      const dy = target.position[1] - y;
      const dz = target.position[2] - z;
      const distance = Math.hypot(dx, dy, dz);
      const threshold = target === this.focused ? target.radiusM + 0.5 : target.radiusM;
      const horizontal = Math.hypot(dx, dz);
      const inFront = horizontal < 1e-5 || (dx * forwardX + dz * forwardZ) / horizontal > (target === this.focused ? -0.15 : 0.1);
      return [{ target, distance, inRange: distance <= threshold, inFront }];
    });
    const activeNow = new Map(distances
      .filter(({ target, distance }) => distance <= target.radiusM + (this.activeEffects.has(target.id) ? 0.5 : 0))
      .filter(({ target }) => target.proximityEffect)
      .map(({ target }) => [target.id, target] as const));
    for (const [id, target] of this.activeEffects) {
      if (!activeNow.has(id)) {this.onDoorEffect?.(target, false);}
    }
    for (const [id, target] of activeNow) {
      if (!this.activeEffects.has(id)) {this.onDoorEffect?.(target, true);}
    }
    this.activeEffects.clear();
    for (const [id, target] of activeNow) {this.activeEffects.set(id, target);}

    const candidates = distances
      .filter(({ inRange, inFront }) => inRange && inFront)
      .sort((a, b) => a.distance - b.distance);
    const retained = candidates.find(({ target }) => target === this.focused);
    const [nearest] = candidates;
    const next = retained && (!nearest || retained.distance <= nearest.distance + 0.3) ? retained.target : nearest?.target ?? null;
    if (next !== this.focused) {
      this.pendingCapability = undefined;
      this.pendingTargetId = undefined;
      this.focused = next;
      this.dwellMs = 0;
      if (!next) {this.publish({ status: 'idle' });}
      else {this.publish({ status: 'nearby', descriptorId: next.id, targetId: next.targetId });}
    } else if (next) {
      this.dwellMs += dtMs;
      const dwellRequired = next.infoDwellMs ?? 350;
      if (this.dwellMs >= dwellRequired && this.current.status === 'nearby') {
        this.publish({ status: 'info', descriptorId: next.id, targetId: next.targetId });
        void this.inspect();
      }
    }
    return this.current;
  }

  async inspect(): Promise<void> {
    if (this.inFlight) {return;}
    const target = this.focused;
    if (!target) {return;}
    const denied = target.allowedRoles && !target.allowedRoles.includes(this.role);
    if (denied) {return this.publish({ status: 'denied', descriptorId: target.id, reason: `Inspect is unavailable to the ${this.role} role.` });}
    if (!target.actions.some((action) => action.kind === 'inspect')) {
      return this.publish({ status: 'denied', descriptorId: target.id, reason: 'No inspect action is declared for this target.' });
    }
    if (!this.onInspect) {
      return this.publish({ status: 'denied', descriptorId: target.id, reason: 'No inspect handler is registered.' });
    }
    this.inFlight = true;
    this.publish({ status: 'committing', descriptorId: target.id, action: 'inspect' });
    try {
      await this.onInspect(target);
      if (this.focused === target) {this.publish({ status: 'completed', descriptorId: target.id, action: 'inspect' });}
    } catch (error) {
      if (this.focused === target) {this.publish({ status: 'failed', descriptorId: target.id, reason: error instanceof Error ? error.message : 'Inspect failed.' });}
    } finally {
      this.inFlight = false;
    }
  }

  async use(capability?: string, confirmed = false): Promise<void> {
    if (this.inFlight) {return;}
    const target = this.focused;
    if (!target) {return;}
    if (confirmed && (this.current.status !== 'confirmation-required' || this.pendingTargetId !== target.id || this.pendingCapability !== capability)) {
      return this.publish({ status: 'denied', descriptorId: target.id, reason: 'Confirmation expired; select the current action again.' });
    }
    const unavailable = this.useUnavailableReason(capability);
    if (unavailable) {return this.publish({ status: 'denied', descriptorId: target.id, reason: unavailable });}
    const access = checkWalkUseAccess(this.role, target, capability, this.handlers, confirmed);
    if (!access.allowed) {
      if (access.reason.startsWith('Confirmation is required')) {
        this.pendingCapability = capability;
        this.pendingTargetId = target.id;
        this.publish({ status: 'confirmation-required', descriptorId: target.id, action: 'use' });
      } else {this.publish({ status: 'denied', descriptorId: target.id, reason: access.reason });}
      return;
    }
    const action = target.actions.find((candidate) => candidate.kind === 'use' && candidate.capability === capability);
    const matchingHandlers = this.handlers.filter((candidate) =>
      candidate.capability === capability && candidate.handlerId.trim() && typeof candidate.execute === 'function');
    const handler = matchingHandlers.length === 1 ? matchingHandlers[0] : undefined;
    if (!action || action.kind !== 'use' || !handler) {
      return this.publish({ status: 'denied', descriptorId: target.id, reason: 'No executable use handler is registered.' });
    }
    this.pendingCapability = undefined;
    this.inFlight = true;
    this.publish({ status: 'committing', descriptorId: target.id, action: 'use' });
    try {
      await handler.execute({ role: this.role, target, action });
      if (this.focused === target) {this.publish({ status: 'completed', descriptorId: target.id, action: 'use' });}
    } catch (error) {
      if (this.focused === target) {this.publish({ status: 'failed', descriptorId: target.id, reason: error instanceof Error ? error.message : 'Use action failed.' });}
    } finally {
      this.inFlight = false;
    }
  }

  cancelConfirmation(): void {
    this.pendingCapability = undefined;
    this.pendingTargetId = undefined;
    if (this.focused) {this.publish({ status: 'info', descriptorId: this.focused.id, targetId: this.focused.targetId });}
  }

  clear(): void {
    for (const target of this.activeEffects.values()) {this.onDoorEffect?.(target, false);}
    this.activeEffects.clear();
    this.focused = null;
    this.dwellMs = 0;
    this.pendingCapability = undefined;
    this.publish({ status: 'idle' });
  }

  private publish(state: InteractionState): void {
    this.current = state;
    this.onState?.(state);
  }
}
