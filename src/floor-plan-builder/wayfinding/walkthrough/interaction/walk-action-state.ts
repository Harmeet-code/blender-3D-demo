export type BenchState = { status: 'standing' } | { status: 'seated'; seatAvailable: true };
export type QueueState = { status: 'outside' } | { status: 'queued'; joinedAt: number };
export type KioskState = { status: 'idle' } | { status: 'browsing' } | { status: 'selection-pending'; itemId: string } | { status: 'confirmation-required'; itemId: string } | { status: 'completed'; itemId: string };
export type ElevatorState = { status: 'idle' } | { status: 'offer-pending'; targetId: string; destinationId: string } | { status: 'confirmation-required'; targetId: string; destinationId: string } | { status: 'completed'; targetId: string; destinationId: string };

export type WalkActionResult<S> = { state: S; accepted: boolean; reason?: string };
const result = <S>(state: S, accepted = true, reason?: string): WalkActionResult<S> => ({ state, accepted, reason });

export function sit(state: BenchState, safeSeatAvailable: boolean): WalkActionResult<BenchState> {
  if (state.status === 'seated') { return result(state); }
  return safeSeatAvailable ? result({ status: 'seated', seatAvailable: true }) : result(state, false, 'A safe seat is unavailable.');
}
export function stand(state: BenchState): WalkActionResult<BenchState> { return state.status === 'standing' ? result(state) : result({ status: 'standing' }); }
export function joinQueue(state: QueueState, joinedAt: number): WalkActionResult<QueueState> {
  if (state.status === 'queued') { return result(state); }
  return Number.isFinite(joinedAt) ? result({ status: 'queued', joinedAt }) : result(state, false, 'Queue timestamp must be finite.');
}
export function leaveQueue(state: QueueState): WalkActionResult<QueueState> { return state.status === 'outside' ? result(state) : result({ status: 'outside' }); }
export function browseKiosk(state: KioskState): WalkActionResult<KioskState> { return state.status === 'idle' || state.status === 'browsing' ? result({ status: 'browsing' }) : result(state, false, 'Kiosk cannot be browsed from the current state.'); }
export function selectKioskItem(state: KioskState, itemId: string): WalkActionResult<KioskState> {
  if (state.status !== 'browsing' && state.status !== 'selection-pending') { return result(state, false, 'Kiosk is not accepting a selection.'); }
  if (!itemId.trim()) { return result(state, false, 'Item id is required.'); }
  return result({ status: 'selection-pending', itemId });
}
export function confirmKioskSelection(state: KioskState, confirmed: boolean): WalkActionResult<KioskState> {
  if (!confirmed || state.status !== 'confirmation-required') { return result(state, false, 'Explicit confirmation is required.'); }
  return result({ status: 'completed', itemId: state.itemId });
}
export function requestKioskConfirmation(state: KioskState): WalkActionResult<KioskState> {
  return state.status === 'selection-pending' ? result({ status: 'confirmation-required', itemId: state.itemId }) : result(state, false, 'No kiosk selection is pending.');
}
export function cancelKiosk(state: KioskState): WalkActionResult<KioskState> { return state.status === 'completed' ? result(state, false, 'Completed selection cannot be cancelled.') : result({ status: 'idle' }); }
export function offerElevator(state: ElevatorState, safeTraversalAvailable: boolean, targetId: string, destinationId: string): WalkActionResult<ElevatorState> {
  if (state.status !== 'idle') { return result(state, false, 'Elevator offer cannot start from the current state.'); }
  return safeTraversalAvailable && targetId.trim() && destinationId.trim() ? result({ status: 'offer-pending', targetId, destinationId }) : result(state, false, 'Safe elevator traversal and a target and destination are required.');
}
export function confirmElevator(state: ElevatorState, confirmed: boolean, safeTraversalAvailable: boolean, targetId: string, destinationId: string): WalkActionResult<ElevatorState> {
  if (state.status !== 'confirmation-required' || !confirmed) { return result(state, false, 'Explicit confirmation is required.'); }
  if (!safeTraversalAvailable || state.targetId !== targetId || state.destinationId !== destinationId) { return result({ status: 'idle' }, false, 'Elevator offer is stale or traversal is unsafe.'); }
  return result({ status: 'completed', targetId, destinationId });
}
export function requestElevatorConfirmation(state: ElevatorState): WalkActionResult<ElevatorState> {
  return state.status === 'offer-pending' ? result({ status: 'confirmation-required', targetId: state.targetId, destinationId: state.destinationId }) : result(state, false, 'No safe elevator offer is pending.');
}
export function cancelElevator(_state: ElevatorState): WalkActionResult<ElevatorState> { return result({ status: 'idle' }); }
