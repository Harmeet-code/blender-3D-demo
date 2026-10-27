import { useEffect, useState } from 'react';

export type BuilderLoadingPhase = 'floor' | 'assets' | 'navigation';
export interface BuilderLoadingState {
  loading: boolean;
  phase: BuilderLoadingPhase;
  /** 0–1 only when the current phase has measurable progress. */
  progress?: number;
  /** Set after the first complete frame at the requested high/default quality. */
  stableHighQualityFrame: boolean;
  error?: string | null;
}

export function builderLoadingVisible(state: BuilderLoadingState, delayElapsed: boolean): boolean {
  return delayElapsed && (state.loading || !state.stableHighQualityFrame || !!state.error);
}

export function useBuilderLoadingVisible(state: BuilderLoadingState, delayMs = 400): boolean {
  const [delayElapsed, setDelayElapsed] = useState(false);
  useEffect(() => {
    const pending = state.loading || !state.stableHighQualityFrame || !!state.error;
    if (!pending) {
      setDelayElapsed(false);
      return;
    }
    const timer = window.setTimeout(() => setDelayElapsed(true), Math.max(0, delayMs));
    return () => window.clearTimeout(timer);
  }, [state.loading, state.stableHighQualityFrame, state.error, delayMs]);
  return builderLoadingVisible(state, delayElapsed);
}

/** Small overlay contract for later canvas integration; contains no 3D scene or loader hooks. */
export function BuilderLoading({
  state,
  retry,
  delayMs = 400,
}: {
  state: BuilderLoadingState;
  retry?: () => void;
  delayMs?: number;
}) {
  const visible = useBuilderLoadingVisible(state, delayMs);
  if (!visible) return null;
  const titles: Record<BuilderLoadingPhase, string> = {
    floor: 'Preparing floor',
    assets: 'Preparing objects',
    navigation: 'Preparing routes',
  };
  const progress =
    state.progress === undefined ? undefined : Math.max(0, Math.min(1, state.progress));
  return (
    <div
      role={state.error ? 'alert' : 'status'}
      aria-live="polite"
      className="absolute inset-0 z-40 grid place-items-center bg-background/80 backdrop-blur-sm"
    >
      <div className="grid gap-3 rounded-xl border bg-background/95 p-5 text-center shadow-lg">
        <svg viewBox="0 0 120 70" width="120" height="70" aria-hidden="true">
          <path
            d="M8 8h44v22H8zM52 8h60v22H52zM8 30h26v32H8zM34 30h46v32H34zM80 30h32v32H80z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            opacity=".45"
          />
          <path
            d="M34 30h18M80 44H63"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
          <circle cx="62" cy="44" r="5" fill="currentColor" />
        </svg>
        <p className="font-medium">
          {state.error ? 'Could not prepare this view' : titles[state.phase]}
        </p>
        {state.error ? (
          <>
            <p className="max-w-sm text-sm text-muted-foreground">{state.error}</p>
            {retry && (
              <button type="button" className="rounded-md border px-3 py-1.5" onClick={retry}>
                Try again
              </button>
            )}
          </>
        ) : progress === undefined ? (
          <progress aria-label={titles[state.phase]} className="w-full" />
        ) : (
          <progress aria-label={titles[state.phase]} className="w-full" max={1} value={progress} />
        )}
      </div>
    </div>
  );
}
