import type { InteractionAction, Role } from '../contracts.ts';
import type { WalkUseHandlerPolicy } from '../foundation/role-policy.ts';
import type { InteractionTarget } from './proximity.ts';
import { sit, stand, joinQueue, leaveQueue, browseKiosk, selectKioskItem, requestKioskConfirmation, confirmKioskSelection, cancelKiosk, type BenchState, type QueueState, type KioskState } from './walk-action-state.ts';

export interface LocalActionState {
  bench: BenchState;
  queue: QueueState;
  kiosk: KioskState;
  selection?: string;
  destination?: string;
  rideOffer?: { destinationId: string; status: 'local-offer' };
}
export interface LocalActionOptions {
  role: Role;
  /** Explicit local eligibility; absent policy denies use. This is not a source ACL. */
  allowedRoles?: readonly Role[];
  items?: Readonly<Record<string, readonly { id: string; label: string }[]>>;
  destinations?: Readonly<Record<string, readonly { id: string; label: string }[]>>;
  /** Must atomically validate and APPLY the physical stance, returning true only after acceptance.
   * Include current capsule sweep, endpoint, bench collider, support, and standing exit clearance.
   * Never disable the bench collider or teleport an upright capsule into its solid bounds. */
  applyBenchStance?: (target: InteractionTarget, stance: 'seated' | 'standing') => boolean;
}
const definitions = [
  ['sit-local', 'Sit', false], ['stand-local', 'Stand', false],
  ['join-local-queue', 'Join local queue', true], ['leave-local-queue', 'Leave local queue', false],
  ['browse-local-kiosk', 'Browse', false], ['order-local-kiosk', 'Create local order', true],
  ['cancel-local-kiosk', 'Cancel selection', false], ['call-elevator', 'Request ride offer', true],
] as const;
export function localActionsFor(recipe: string): InteractionAction[] {
  const names: readonly string[] = recipe === 'bench' ? ['sit-local', 'stand-local']
    : recipe === 'food-kiosk' ? ['join-local-queue', 'leave-local-queue', 'browse-local-kiosk', 'order-local-kiosk', 'cancel-local-kiosk']
    : recipe === 'elevator' ? ['call-elevator'] : [];
  return definitions.filter(([id]) => names.includes(id)).map(([capability, label, commits]) => ({ kind: 'use', capability, label, commits, requiresConfirmation: commits }));
}
/** One owner per pinned walkthrough session. No document writes, stock, payment, or backend queue. */
export class WalkLocalActions {
  private states = new Map<string, LocalActionState>();
  private revision = 0;
  private listeners = new Set<() => void>();
  constructor(readonly options: LocalActionOptions) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.revision;
  private publish() { this.revision++; this.listeners.forEach((listener) => listener()); }
  state(id: string): LocalActionState {
    let state = this.states.get(id);
    if (!state) { state = { bench: { status: 'standing' }, queue: { status: 'outside' }, kiosk: { status: 'idle' } }; this.states.set(id, state); }
    return state;
  }
  select(target: InteractionTarget, id: string, destination = false) {
    const options = destination ? this.options.destinations : this.options.items;
    if (!options?.[target.id]?.some((item) => item.id === id)) { return; }
    const state = this.state(target.id);
    if (destination) { state.destination = id; state.rideOffer = undefined; }
    else {
      const next = selectKioskItem(state.kiosk, id);
      if (!next.accepted) { return; }
      state.kiosk = next.state; state.selection = id;
    }
    this.publish();
  }
  unavailable(target: InteractionTarget, capability: string): string | null {
    if (!this.options.allowedRoles?.includes(this.options.role)) { return 'Local use role policy is unavailable or denies this role.'; }
    const state = this.state(target.id);
    if ((capability === 'sit-local' || capability === 'stand-local') && !this.options.applyBenchStance) { return 'Seating unavailable: physical stance and clearance controller is not integrated.'; }
    if (capability === 'order-local-kiosk' && state.kiosk.status !== 'selection-pending') { return 'Browse and select an available item first.'; }
    if (capability === 'browse-local-kiosk' && !this.options.items?.[target.id]?.length) { return 'Kiosk menu is unavailable.'; }
    if (capability === 'call-elevator' && !this.options.destinations?.[target.id]?.some((item) => item.id === state.destination)) { return 'Choose an explicitly supplied destination before requesting a local ride offer. Physical travel is unavailable here.'; }
    return null;
  }
  handlers(): WalkUseHandlerPolicy[] {
    return definitions.map(([capability, , commits]) => ({ capability, commits, handlerId: `walk-local.${capability}.v1`, allowedRoles: this.options.allowedRoles ?? [], execute: ({ target }: { target: InteractionTarget }) => {
      const reason = this.unavailable(target, capability);
      if (reason) { throw new Error(reason); }
      const state = this.state(target.id);
      switch (capability) {
        case 'call-elevator': state.rideOffer = { destinationId: state.destination!, status: 'local-offer' }; break;
        case 'sit-local':
          if (state.bench.status !== 'seated') {
            if (!this.options.applyBenchStance?.(target, 'seated')) { throw new Error('Seat transition rejected by physical clearance controller.'); }
            state.bench = sit(state.bench, true).state;
          } break;
        case 'stand-local':
          if (state.bench.status === 'seated') {
            if (!this.options.applyBenchStance?.(target, 'standing')) { throw new Error('Standing exit is blocked; remain seated.'); }
            state.bench = stand(state.bench).state;
          } break;
        case 'join-local-queue': state.queue = joinQueue(state.queue, performance.now()).state; break;
        case 'leave-local-queue': state.queue = leaveQueue(state.queue).state; break;
        case 'browse-local-kiosk': state.kiosk = browseKiosk(state.kiosk).state; break;
        case 'order-local-kiosk': state.kiosk = confirmKioskSelection(requestKioskConfirmation(state.kiosk).state, true).state; break;
        case 'cancel-local-kiosk': state.kiosk = cancelKiosk(state.kiosk).state; state.selection = undefined; break;
      }
      this.publish();
    } }));
  }
}
