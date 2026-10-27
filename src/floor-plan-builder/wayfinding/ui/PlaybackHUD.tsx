import { useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, SkipForward, X, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import type { PlanDocument } from '../../model/types.ts';
import { isEditableTarget } from '../../model/shortcuts.ts';
import { usePlaybackStore, routeKey } from '../store/playback-store.ts';
import { selectActiveResult, useWayfindingStore } from '../store/wayfinding-store.ts';
import { GameControls } from './GameControls.tsx';
import { gsap } from 'gsap';

/** DOM subscribes at 10 Hz; the follower and cameras never subscribe to these snapshots. */
export function PlaybackHUD({ document, placement = 'overlay', lightingControls }: { document: PlanDocument; placement?: 'overlay' | 'sidebar'; lightingControls: boolean }) {
  const session = usePlaybackStore((state) => state.session),
    status = usePlaybackStore((state) => state.status);
  const snapshot = usePlaybackStore((state) => state.snapshot),
    speed = usePlaybackStore((state) => state.speed);
  const comfort = usePlaybackStore((state) => state.comfort),
    changed = usePlaybackStore((state) => state.changed),
    message = usePlaybackStore((state) => state.message),
    awaiting = usePlaybackStore((state) => state.awaiting);
  const outcome = useWayfindingStore((state) => state.outcome),
    routeStatus = useWayfindingStore((state) => state.status),
    active = useWayfindingStore(selectActiveResult);
  const acknowledgedKey = usePlaybackStore((state) => state.liveKey);
  const pendingAcknowledgement = usePlaybackStore((state) => state.pendingAcknowledgement);
  const liveKey = routeKey(active);
  const awaitingRequest = useRef<unknown>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!session || !panel.current) {
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || comfort;
    const tween = gsap.fromTo(
      panel.current,
      { y: reduced ? 0 : 14, opacity: 0 },
      { y: 0, opacity: 1, duration: reduced ? 0.1 : 0.3, ease: 'power2.out' },
    );
    return () => {
      tween.kill();
    };
  }, [session?.generation, comfort]);
  useEffect(() => {
    if (session && document === session.source && pendingAcknowledgement) {
      if (routeStatus !== 'routing') {
        usePlaybackStore.getState().keep(document, active);
      }
      return;
    }
    if (
      session &&
      (document !== session.source || liveKey !== acknowledgedKey) &&
      !changed &&
      !awaiting
    ) {
      usePlaybackStore.getState().markChanged();
    }
  }, [
    session,
    document,
    changed,
    awaiting,
    liveKey,
    acknowledgedKey,
    pendingAcknowledgement,
    routeStatus,
    active,
  ]);
  useEffect(() => {
    if (
      !awaiting ||
      routeStatus === 'routing' ||
      !outcome ||
      outcome.request !== awaitingRequest.current
    ) {
      return;
    }
    if (active) {
      usePlaybackStore.getState().accept(active, document);
    } else {
      usePlaybackStore
        .getState()
        .fail(
          outcome.failure ??
            'No updated route is available. Choose a new destination or keep the previous path.',
        );
    }
  }, [awaiting, routeStatus, outcome, active, document]);
  useEffect(() => {
    if (!session) {
      return;
    }
    const key = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        isEditableTarget(event.target) ||
        (event.code === 'Space' &&
          event.target instanceof Element &&
          !!event.target.closest('button, a, [role="button"]')) ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }
      const state = usePlaybackStore.getState();
      if (event.code === 'Space') {
        event.preventDefault();
        state.toggle();
      } else if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
        event.preventDefault();
        state.seek(
          (state.session?.runtime.progress ?? 0) + (event.code === 'ArrowRight' ? 0.02 : -0.02),
        );
      } else if (event.code === 'Escape') {
        event.preventDefault();
        state.exit();
      }
      if (event.defaultPrevented) {
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [session]);
  if (!session) {
    return null;
  }
  const floorName =
    document.floors.find((floor) => floor.source.id === snapshot.floorId)?.source.name ??
    snapshot.floorId;
  const reroute = () => {
    const { request } = useWayfindingStore.getState();
    if (!request) {
      usePlaybackStore.getState().fail('Choose a destination before re-routing.');
      return;
    }
    const value = session.runtime;
    const next = {
      ...request,
      start: {
        floorId: value.floorId,
        kind: 'point' as const,
        point: [value.position[0], value.position[2]] as [number, number],
      },
    };
    awaitingRequest.current = next;
    usePlaybackStore.getState().wait();
    useWayfindingStore.getState().setRequest(next);
  };
  return (
    <section
      ref={panel}
      aria-label="Walkthrough playback"
      className={placement === 'sidebar'
        ? 'flex w-full max-w-full flex-col gap-1.5 rounded-xl border bg-background/95 p-3 text-foreground shadow-xl'
        : 'absolute inset-x-3 bottom-3 z-30 mx-auto flex max-w-5xl flex-col gap-1.5 rounded-xl border bg-background/95 p-3 text-foreground shadow-xl'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          {status === 'arrived'
            ? 'You have arrived'
            : status === 'paused'
              ? `Paused · ${snapshot.phase}`
              : snapshot.phase}{' '}
          · {floorName}
        </span>
        <span>
          {snapshot.remaining.toFixed(1)} m remaining ·{' '}
          {(status === 'playing' ? snapshot.speed * speed : 0).toFixed(2)} m/s ·{' '}
          {Math.round(snapshot.progress * 100)}%{' · ~'}
          {Math.ceil((session.runtime.path.duration * (1 - snapshot.progress)) / speed)} s
        </span>
      </div>
      <p className="text-sm text-slate-300">
        {session.route.instructions.at(-1)?.replace(/^Arrive at /, 'Go to: ')}
      </p>
      {(changed || message) && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-950/30 p-2 text-sm"
        >
          <span>
            {message ?? 'The route or layout changed. Your previous path is still playing.'}
          </span>
          {changed && (
            <>
              <Button size="sm" variant="outline" disabled={awaiting} onClick={reroute}>
                <Route />
                Re-route from here
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  usePlaybackStore.getState().keep(document, active, routeStatus === 'routing')
                }
              >
                Keep current path
              </Button>
            </>
          )}
        </div>
      )}
      <div className="relative">
        <input
          aria-label="Walkthrough progress"
          className="h-4 w-full accent-cyan-400"
          type="range"
          min="0"
          max="1"
          step=".001"
          value={snapshot.progress}
          onChange={(event) => usePlaybackStore.getState().seek(Number(event.target.value))}
        />
        <div className="pointer-events-none absolute inset-x-1 bottom-0 h-1" aria-hidden>
          {session.runtime.path.ticks.map((tick, index) => (
            <span
              key={index}
              className="absolute h-1 w-px bg-slate-400"
              style={{ left: `${(tick / Math.max(0.001, session.runtime.path.length)) * 100}%` }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => usePlaybackStore.getState().toggle()} disabled={awaiting}>
          {status === 'playing' ? <Pause /> : <Play />}
          {status === 'playing' ? 'Pause' : status === 'arrived' ? 'Replay' : 'Play'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => usePlaybackStore.getState().seek(0)}>
          <RotateCcw />
          Restart
        </Button>
        <Button size="sm" variant="outline" onClick={() => usePlaybackStore.getState().seek(1)}>
          <SkipForward />
          Skip to destination
        </Button>
        <Field className="w-auto">
          <FieldLabel className="sr-only" htmlFor="playback-speed">
            Walking speed
          </FieldLabel>
          <select
            id="playback-speed"
            className="h-8 rounded-md border border-white/20 bg-slate-900 px-2 text-sm"
            value={speed}
            onChange={(event) => usePlaybackStore.getState().setSpeed(Number(event.target.value))}
          >
            {[0.5, 1, 2, 4].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </Field>
        <Field orientation="horizontal" className="w-auto">
          <Switch
            id="playback-comfort"
            checked={comfort}
            onCheckedChange={(value) => usePlaybackStore.getState().setComfort(value)}
          />
          <FieldLabel htmlFor="playback-comfort">Comfort</FieldLabel>
        </Field>
        <Button size="sm" variant="ghost" onClick={() => usePlaybackStore.getState().exit()}>
          <X />
          Exit walkthrough
        </Button>
      </div>
      <GameControls lightingControls={lightingControls} />
      <p className="sr-only">
        Space play/pause · ←/→ scrub · Esc exit · drag to look around in first person
      </p>
    </section>
  );
}
