import { Button } from '@/components/ui/button';
import { useRouteGuidance } from '../model/route-guidance.ts';

/** UI follows published route progress; the mutable physics cursor remains the motion owner. */
export function RouteGuidance() {
  const guidance = useRouteGuidance();
  if (!guidance.plan) {
    return null;
  }
  const active =
    guidance.phase === 'starting' || guidance.phase === 'walking' || guidance.phase === 'retrying';
  const percent =
    guidance.plan.distanceMetres > 0
      ? Math.min(
          100,
          Math.max(0, 100 * (1 - guidance.remainingMetres / guidance.plan.distanceMetres)),
        )
      : guidance.phase === 'arrived'
        ? 100
        : 0;
  return (
    <section aria-label="Walking directions" className="mt-4 border-t pt-3 text-xs">
      <p className="font-medium">Directions to {guidance.plan.to.label}</p>
      <div aria-live="polite" className="mt-2">
        {guidance.phase === 'starting' && <p>Starting your route…</p>}
        {guidance.phase === 'retrying' && (
          <p>The route was blocked. Finding one alternative from your current location…</p>
        )}
        {guidance.phase === 'walking' && <p>Walking on {guidance.floorId}.</p>}
        {guidance.phase === 'arrived' && (
          <p className="font-medium text-emerald-600">
            You have arrived at {guidance.plan.to.label}.
          </p>
        )}
        {guidance.phase === 'cancelled' && (
          <p className="text-muted-foreground">Walking directions cancelled.</p>
        )}
        {guidance.error && (
          <p role="alert" className="text-destructive" data-error-code={guidance.error.code}>
            {guidance.error.message}
          </p>
        )}
      </div>
      {guidance.phase === 'walking' && (
        <p className="mt-1">
          {Math.ceil(guidance.remainingMetres)} m remaining · about{' '}
          {Math.max(1, Math.ceil(guidance.remainingMetres / 1.3 / 60))} min
        </p>
      )}
      {(active || guidance.phase === 'arrived') && (
        <progress
          aria-label="Walking route progress"
          max={100}
          value={percent}
          className="mt-2 h-2 w-full accent-sky-500"
        />
      )}
      <ol className="mt-3 flex list-decimal flex-col gap-2 pl-4">
        {guidance.plan.steps.map((step, index) => (
          <li
            key={`${index}:${step.floorId}`}
            className={
              active && step.floorId === guidance.floorId ? 'font-medium' : 'text-muted-foreground'
            }
          >
            {step.label}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex gap-2">
        {active && (
          <Button type="button" variant="outline" size="sm" onClick={guidance.cancel}>
            Cancel walking
          </Button>
        )}
        {!active && (
          <Button type="button" variant="ghost" size="sm" onClick={guidance.dismiss}>
            Dismiss directions
          </Button>
        )}
      </div>
    </section>
  );
}
