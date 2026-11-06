import { useSyncExternalStore } from 'react';
import type { WalkLocalActions } from '../interaction/local-actions.ts';
import type { InteractionTarget } from '../interaction/proximity.ts';

export function LocalActionPanel({ actions, target, disabled, onSelectionChange }: {
  actions: WalkLocalActions; target: InteractionTarget; disabled: boolean; onSelectionChange: () => void;
}) {
  useSyncExternalStore(actions.subscribe, actions.snapshot, actions.snapshot);
  const state = actions.state(target.id);
  const kiosk = target.actions.some((action) => action.kind === 'use' && action.capability === 'browse-local-kiosk');
  const bench = target.actions.some((action) => action.kind === 'use' && action.capability === 'sit-local');
  const queue = target.actions.some((action) => action.kind === 'use' && action.capability === 'join-local-queue');
  const elevator = target.actions.some((action) => action.kind === 'use' && action.capability === 'call-elevator');
  const choices = elevator ? actions.options.destinations?.[target.id] : actions.options.items?.[target.id];
  return <div className="mt-2 text-slate-200">
    {elevator && <p role="status">{state.rideOffer ? `Local ride offer: ${state.rideOffer.destinationId}. Physical travel requires a validated connector route.` : 'Local ride offer only; no passenger movement.'}</p>}
    {bench && <p role="status">Stance: {state.bench.status}</p>}
    {queue && <p role="status">Local queue: {state.queue.status === 'queued' ? 'Joined locally' : 'Not joined'}</p>}
    {kiosk && <p role="status">Local kiosk: {state.kiosk.status === 'completed' ? `Local order created: ${state.kiosk.itemId}` : state.kiosk.status}</p>}
    {(kiosk || elevator) && <label className="mt-2 block">{elevator ? 'Destination' : 'Item'}
      <select className="ml-2 rounded bg-slate-800 p-2" value={(elevator ? state.destination : state.selection) ?? ''}
        disabled={disabled || (!elevator && state.kiosk.status !== 'browsing' && state.kiosk.status !== 'selection-pending')}
        onChange={(event) => { onSelectionChange(); actions.select(target, event.target.value, elevator); }}>
        <option value="">{choices?.length ? 'Choose…' : 'Source options unavailable'}</option>
        {choices?.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select>
    </label>}
    {(kiosk || queue) && <p className="mt-1 text-xs">Walk-local only; no reservation, payment or backend order.</p>}
  </div>;
}
