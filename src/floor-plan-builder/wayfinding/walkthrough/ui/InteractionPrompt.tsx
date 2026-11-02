import type { InteractionAction, InteractionState } from '../contracts.ts';
import type { InteractionTarget, ProximityInteractionRuntime } from '../interaction/proximity.ts';

export function InteractionPrompt({
  runtime,
  target,
  state,
}: {
  runtime: ProximityInteractionRuntime;
  target: InteractionTarget | null;
  state: InteractionState;
}) {
  if (!target) {return null;}
  const busy = runtime.isBusy || state.status === 'committing';
  const hasInspect = target.actions.some((action) => action.kind === 'inspect');
  const useActions = target.actions.filter((action): action is Extract<InteractionAction, { kind: 'use' }> => action.kind === 'use');
  const unavailable = useActions.length === 0
    ? 'Use unavailable: no action is declared.'
    : useActions.every((action) => !runtime.canUse(action.capability))
      ? `Use unavailable: ${runtime.useUnavailableReason(useActions[0]?.capability) ?? 'no role-eligible handler.'}`
      : null;
  const message = state.status === 'denied' || state.status === 'failed'
    ? state.reason
    : state.status === 'confirmation-required'
      ? 'Confirm this action to continue.'
      : state.status === 'completed'
        ? `${state.action === 'inspect' ? 'Details opened' : 'Action completed'}.`
        : state.status === 'committing'
          ? 'Working…'
          : state.status === 'info'
            ? 'Details are ready.'
            : 'Nearby';
  return (
    <section
      aria-label={`Nearby: ${target.targetId}`}
      className="pointer-events-auto basis-full rounded-lg border border-white/15 bg-slate-950/95 p-3 text-left text-sm text-white shadow-lg"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="font-semibold">{target.targetId}</div>
      <div role="status" className="mt-1 text-slate-300">{message}</div>
      {state.status === 'info' && <div className="mt-2 text-slate-200">Select an action to inspect or use this item.</div>}
      {unavailable && <div className="mt-2 text-amber-200">{unavailable}</div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {hasInspect && <button type="button" disabled={busy} className="rounded bg-cyan-700 px-3 py-2 hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void runtime.inspect()}>Inspect</button>}
        {useActions.map((action) => {
          const ready = runtime.canUse(action.capability);
          if (!ready) {return null;}
          const confirming = state.status === 'confirmation-required' && runtime.confirmationCapability === action.capability;
          return confirming ? (
            <span key={action.capability} className="flex gap-2">
              <button type="button" disabled={busy} className="rounded bg-amber-700 px-3 py-2 hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void runtime.use(action.capability, true)}>Confirm {action.label}</button>
              <button type="button" disabled={busy} className="rounded bg-slate-700 px-3 py-2 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => runtime.clear()}>Cancel</button>
            </span>
          ) : (
            <button key={action.capability} type="button" disabled={busy} className="rounded bg-emerald-700 px-3 py-2 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void runtime.use(action.capability)}>Use: {action.label}</button>
          );
        })}
      </div>
    </section>
  );
}
