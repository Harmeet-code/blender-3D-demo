export type BenchState = { status: 'standing' } | { status: 'seated'; seatAvailable: true };
export type QueueState = { status: 'outside' } | { status: 'queued'; joinedAt: number };
export type KioskState = { status: 'idle' } | { status: 'browsing' } | { status: 'selection-pending'; itemId: string } | { status: 'confirmation-required'; itemId: string } | { status: 'completed'; itemId: string };
export type ElevatorState = { status: 'idle' } | { status: 'offer-pending'; traversalAvailable: boolean } | { status: 'confirmation-required' } | { status: 'completed' };

export type WalkActionResult<S> = { state: S; accepted: boolean; reason?: string };
const result = <S>(state: S, accepted = true, reason?: string): WalkActionResult<S> => ({ state, accepted, reason });

export function sit(state: BenchState, safeSeatAvailable: boolean): WalkActionResult<BenchState> {
  return safeSeatAvailable ? result({ status: 'seated', seatAvailable: true }) : result(state, false, 'A safe seat is unavailable.');
}
export function stand(_state: BenchState): WalkActionResult<BenchState> { return result({ status: 'standing' }); }
export function joinQueue(_state: QueueState, joinedAt: number): WalkActionResult<QueueState> {
  return Number.isFinite(joinedAt) ? result({ status: 'queued', joinedAt }) : result({ status: 'outside' }, false, 'Queue timestamp must be finite.');
}
export function leaveQueue(_state: QueueState): WalkActionResult<QueueState> { return result({ status: 'outside' }); }
export function browseKiosk(_state: KioskState): WalkActionResult<KioskState> { return result({ status: 'browsing' }); }
export function selectKioskItem(state: KioskState, itemId: string): WalkActionResult<KioskState> {
  if (!itemId.trim()) return result(state, false, 'Item id is required.');
  return result({ status: 'selection-pending', itemId });
}
export function confirmKioskSelection(state: KioskState, confirmed: boolean): WalkActionResult<KioskState> {
  if (!confirmed || state.status !== 'confirmation-required') return result(state, false, 'Explicit confirmation is required.');
  return result({ status: 'completed', itemId: state.itemId });
}
export function requestKioskConfirmation(state: KioskState): WalkActionResult<KioskState> {
  return state.status === 'selection-pending' ? result({ status: 'confirmation-required', itemId: state.itemId }) : result(state, false, 'No kiosk selection is pending.');
}
export function cancelKiosk(state: KioskState): WalkActionResult<KioskState> { return state.status === 'completed' ? result(state, false, 'Completed selection cannot be cancelled.') : result({ status: 'idle' }); }
export function offerElevator(_state: ElevatorState, safeTraversalAvailable: boolean): WalkActionResult<ElevatorState> {
  return safeTraversalAvailable ? result({ status: 'offer-pending', traversalAvailable: true }) : result({ status: 'idle' }, false, 'Safe elevator traversal is unavailable.');
}
export function confirmElevator(state: ElevatorState, confirmed: boolean): WalkActionResult<ElevatorState> {
  if (state.status !== 'confirmation-required' || !confirmed) return result(state, false, 'Explicit confirmation is required.');
  return result({ status: 'completed' });
}
export function requestElevatorConfirmation(state: ElevatorState): WalkActionResult<ElevatorState> {
  return state.status === 'offer-pending' && state.traversalAvailable ? result({ status: 'confirmation-required' }) : result(state, false, 'No safe elevator offer is pending.');
}
export function cancelElevator(_state: ElevatorState): WalkActionResult<ElevatorState> { return result({ status: 'idle' }); }
