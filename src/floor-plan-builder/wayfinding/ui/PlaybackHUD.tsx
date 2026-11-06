import { requestAutoWalkStop } from '../walkthrough/WalkthroughLayer.tsx';
import { useEffect, useRef } from 'react';
import {
  CheckCircle2,
  MapPin,
  Pause,
  Play,
  Route,
  TriangleAlert,
  X,
} from 'lucide-react';
import { cn } from 'cn';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { PlanDocument } from '../../model/types.ts';
import { isEditableTarget } from '../../model/shortcuts.ts';
import { usePlaybackStore, routeKey } from '../store/playback-store.ts';
import { selectActiveResult, useWayfindingStore } from '../store/wayfinding-store.ts';
import { GameControls } from './GameControls.tsx';
import { WalkProductControls } from '../walkthrough/ui/WalkProductControls.tsx';
import type { Role } from '../walkthrough/contracts.ts';
import {
  isWalkRoutePoseCurrent,
  walkDestinationLabel,
} from '../walkthrough/maneuver-guidance.ts';
import { gsap } from 'gsap';

/** DOM subscribes at 10 Hz; the follower and cameras never subscribe to these snapshots. */
export function PlaybackHUD({
  document,
  placement = 'overlay',
  lightingControls,
  role,
  onRoleChange,
}: {
  document: PlanDocument;
  placement?: 'overlay' | 'sidebar';
  lightingControls: boolean;
  role?: Role;
  onRoleChange?: (role: Role) => void;
}) {
  const session = usePlaybackStore((state) => state.session),
    status = usePlaybackStore((state) => state.status);
  const snapshot = usePlaybackStore((state) => state.snapshot),
    speed = usePlaybackStore((state) => state.speed);
  const comfort = usePlaybackStore((state) => state.comfort),
    changed = usePlaybackStore((state) => state.changed),
    message = usePlaybackStore((state) => state.message),
    awaiting = usePlaybackStore((state) => state.awaiting);
  const routeStatus = useWayfindingStore((state) => state.status),
    active = useWayfindingStore(selectActiveResult);
  const acknowledgedKey = usePlaybackStore((state) => state.liveKey);
  const pendingAcknowledgement = usePlaybackStore((state) => state.pendingAcknowledgement);
  const liveKey = routeKey(active);
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
    if (session?.kind !== 'route') {
      return;
    }
    if (session && document === session.source && pendingAcknowledgement) {
      if (routeStatus !== 'routing') {
        usePlaybackStore.getState().keep(document, active);
      }
      return;
    }
    if (
      session &&
      (document !== session.source || (!!active && liveKey !== acknowledgedKey)) &&
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
    if (!session) {
      return;
    }
    const key = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        event.preventDefault();
        const state = usePlaybackStore.getState();
        if (state.status === 'playing' && state.session) {
          requestAutoWalkStop(state.session.runtime);
        }
        event.stopImmediatePropagation();
        return;
      }
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
        if (state.status === 'playing' && state.session) {
          requestAutoWalkStop(state.session.runtime);
        } else if (state.session?.kind === 'route') {
          state.resume();
        }
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
  const { route } = session;
  const arrived = status === 'arrived';
  const walking = !!route && status === 'playing';
  const connectorActive = !!session.runtime.connector;
  const autoMoving = walking || connectorActive;
  const needsRecalculation =
    !!route &&
    status === 'paused' &&
    !isWalkRoutePoseCurrent({
      path: session.runtime.path,
      distanceM: snapshot.distance,
      legIndex: session.runtime.leg,
      floorId: snapshot.floorId,
      position: [snapshot.x, snapshot.y, snapshot.z],
    });
  const progress = Math.round(snapshot.progress * 100);
  const etaSeconds = route
    ? Math.max(0, Math.ceil((session.runtime.path.duration * (1 - snapshot.progress)) / speed))
    : 0;
  const destination = walkDestinationLabel(route);
  const statusLabel = awaiting
    ? 'Re-routing'
    : connectorActive
      ? 'In transit'
      : session.kind === 'free'
        ? 'Free walk'
        : arrived
          ? 'Arrived'
          : needsRecalculation
            ? 'Off route'
          : walking
            ? 'Navigating'
            : 'Paused';
  const statusDescription = arrived
    ? `Route complete on ${floorName}.`
    : awaiting
      ? 'Calculating a route from your current position.'
      : !changed && message
        ? message
        : needsRecalculation
          ? 'You moved off route. Recalculate directions from your current position.'
          : connectorActive
            ? snapshot.phase
            : session.kind === 'free'
              ? 'Use WASD or the arrow keys to explore.'
              : status === 'paused'
                ? 'Auto-walk is paused. Your next direction remains on the map.'
                : snapshot.phase;
  const reroute = () => usePlaybackStore.getState().resume();
  const toggleAutoWalk = () => {
    const state = usePlaybackStore.getState();
    if (window.document.pointerLockElement) {
      window.document.exitPointerLock();
    }
    if (
      state.session &&
      (state.status === 'playing' || state.session.runtime.connector) &&
      requestAutoWalkStop(state.session.runtime)
    ) {
      return;
    }
    state.resume();
  };
  return (
    <section
      ref={panel}
      aria-label="Walkthrough playback"
      className={cn(
        'pointer-events-auto flex max-w-full flex-col gap-3 rounded-xl border bg-background/95 p-3 text-foreground shadow-xl backdrop-blur-sm',
        placement === 'sidebar'
          ? 'w-full'
          : 'absolute bottom-3 left-3 z-30 max-h-[55%] w-[calc(100%-1.5rem)] max-w-sm overflow-y-auto overscroll-contain',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant={arrived ? 'secondary' : autoMoving ? 'default' : 'outline'}>
            {arrived && <CheckCircle2 data-icon="inline-start" aria-hidden />}
            {statusLabel}
          </Badge>
          <span className="truncate text-xs text-muted-foreground">{floorName}</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Exit walkthrough"
          onClick={() => usePlaybackStore.getState().exit()}
        >
          <X data-icon="inline-start" aria-hidden />
          Exit
        </Button>
      </div>

      <div className="flex min-w-0 items-start gap-2">
        <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {route ? 'Destination' : 'Walkthrough'}
          </p>
          <h2 className="truncate text-base font-semibold">
            {route ? destination : `Explore ${floorName}`}
          </h2>
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {statusDescription}
          </p>
        </div>
      </div>

      {changed && (
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertDescription className="flex flex-col gap-2">
            <span>
              {message ?? 'The route or layout changed. Your previous path is still playing.'}
            </span>
            {changed && route && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={awaiting} onClick={reroute}>
                  <Route data-icon="inline-start" aria-hidden />
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
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {route && !arrived && (
        <div className="flex flex-col gap-2">
          <div className="relative py-1">
            <Progress
              value={progress}
              aria-label="Walkthrough progress"
              aria-valuetext={`${progress}% complete`}
              className="h-2"
            />
            <div className="pointer-events-none absolute inset-x-1 bottom-0 h-1" aria-hidden>
              {session.runtime.path.ticks.map((tick, index) => (
                <span
                  key={index}
                  className="absolute h-1 w-px bg-foreground/30"
                  style={{
                    left: `${(tick / Math.max(0.001, session.runtime.path.length)) * 100}%`,
                  }}
                />
              ))}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted/50 p-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Remaining</dt>
              <dd className="text-sm font-semibold">{snapshot.remaining.toFixed(1)} m</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ETA</dt>
              <dd className="text-sm font-semibold">~{etaSeconds} sec</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Progress</dt>
              <dd className="text-sm font-semibold">{progress}%</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pace</dt>
              <dd className="text-sm font-semibold">
                {walking ? `${(snapshot.speed * speed).toFixed(2)} m/s` : 'Paused'}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {(route || connectorActive) && !arrived && (
        <Button
          type="button"
          className="w-full sm:w-fit"
          variant={autoMoving ? 'secondary' : 'default'}
          disabled={awaiting}
          onClick={toggleAutoWalk}
        >
          {autoMoving ? (
            <Pause data-icon="inline-start" aria-hidden />
          ) : (
            <Play data-icon="inline-start" aria-hidden />
          )}
          {autoMoving
            ? 'Stop auto-walk'
            : awaiting
              ? 'Re-routing...'
              : needsRecalculation
                ? 'Recalculate & resume'
                : 'Resume auto-walk'}
        </Button>
      )}

      <WalkProductControls role={role} onRoleChange={onRoleChange} />
      <GameControls
        lightingControls={lightingControls}
        showNavigationStatus={!!route && !arrived}
      />
      <p className="sr-only">
        WASD or arrow keys take manual control · Space stops or recalculates auto-walk · Esc stops
        auto-walk and stays in walkthrough · V switches camera
      </p>
    </section>
  );
}
