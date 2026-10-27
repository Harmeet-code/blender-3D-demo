import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import type { PlanDocument } from '../../model/types.ts';
import { selectActiveResult, useWayfindingStore } from '../store/wayfinding-store.ts';
import { usePlaybackStore } from '../store/playback-store.ts';
export function RouteCard({
  document,
  setFloor,
  clear,
  canWalk = true,
  floorId,
}: {
  document: PlanDocument;
  setFloor: (floorId: string) => void;
  clear: () => void;
  canWalk?: boolean;
  floorId?: string;
}) {
  const outcome = useWayfindingStore((state) => state.outcome),
    option = useWayfindingStore((state) => state.option);
  const setOption = useWayfindingStore((state) => state.setOption),
    status = useWayfindingStore((state) => state.status);
  const buildMs = useWayfindingStore((state) => state.buildMs),
    active = useWayfindingStore(selectActiveResult);
  const animated = useWayfindingStore((state) => state.animated),
    setAnimated = useWayfindingStore((state) => state.setAnimated);
  const walking = usePlaybackStore((state) => !!state.session),
    walkError = usePlaybackStore((state) => state.message);
  if (status === 'idle' && !outcome) {
    return null;
  }
  const failure = outcome?.failures?.[option] ?? outcome?.failure;
  return (
    <div className="fp-form flex flex-col gap-3" aria-label="Route details" aria-live="polite">
      {status === 'routing' && <p className="fp-muted">Updating routes…</p>}
      <div className="fp-row">
        {(['shortest', 'accessible'] as const).map((choice) => (
          <Button
            key={choice}
            size="sm"
            variant={option === choice ? 'default' : 'outline'}
            aria-pressed={option === choice}
            onClick={() => setOption(choice)}
          >
            {choice === 'shortest' ? 'Shortest' : 'Accessible'}
            {outcome?.options[choice] ? ` · ${outcome.options[choice].lengthM.toFixed(1)} m` : ''}
          </Button>
        ))}
      </div>
      {!active && status !== 'routing' && (
        <p role="alert">{failure ?? `No ${option} route is available.`}</p>
      )}
      {active && (
        <>
          <Button
            size="sm"
            disabled={walking || !canWalk}
            onClick={() =>
              usePlaybackStore
                .getState()
                .begin(active, document, floorId ?? active.segments[0]!.floorId)
            }
          >
            Start walkthrough
          </Button>
          {!canWalk && (
            <p className="fp-muted">
              Apply or discard pending floor edits before starting a walkthrough.
            </p>
          )}
          {walkError && !walking && <p role="alert">{walkError}</p>}
          <p>
            {active.lengthM.toFixed(1)} m · ~{Math.round(active.secondsEta)} s
            {buildMs !== null && (
              <span className="fp-muted"> · routing {buildMs.toFixed(0)} ms</span>
            )}
          </p>
          {(active.snapped.start || active.snapped.dest) && (
            <p className="fp-muted">
              {active.snapped.start && active.snapped.dest
                ? 'Start and destination snapped to walkable points.'
                : active.snapped.start
                  ? 'Start snapped to a walkable point.'
                  : 'Destination snapped to a walkable point.'}
            </p>
          )}
          {active.warnings.map((warning) => (
            <p key={warning} className="fp-muted">
              {warning}
            </p>
          ))}
          <ol className="fp-route-steps list-decimal space-y-2 pl-5 text-sm">
            {active.instructions.map((instruction, index) => (
              <li key={index}>{instruction}</li>
            ))}
          </ol>
          <div className="fp-row">
            {[
              ...new Set(
                active.segments.flatMap((segment) =>
                  segment.toFloorId ? [segment.floorId, segment.toFloorId] : [segment.floorId],
                ),
              ),
            ].map((id) => (
              <Button key={id} size="sm" variant="outline" onClick={() => setFloor(id)}>
                Show {document.floors.find((floor) => floor.source.id === id)?.source.name ?? id}
              </Button>
            ))}
          </div>
          <Field orientation="horizontal">
            <Switch id="route-animation" checked={animated} onCheckedChange={setAnimated} />
            <FieldLabel htmlFor="route-animation">Animate route</FieldLabel>
          </Field>
        </>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          usePlaybackStore.getState().exit();
          clear();
        }}
      >
        Clear route
      </Button>
    </div>
  );
}
