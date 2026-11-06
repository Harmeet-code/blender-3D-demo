import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Route,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PlanDocument } from '../../../model/types.ts';
import { routeKey, usePlaybackStore } from '../../store/playback-store.ts';
import { selectActiveResult, useWayfindingStore } from '../../store/wayfinding-store.ts';
import {
  describeWalkManeuver,
  isWalkRoutePoseCurrent,
  nextWalkManeuver,
  walkDestinationLabel,
  type WalkManeuver,
} from '../maneuver-guidance.ts';

interface GuidanceNotice {
  label: string;
  title: string;
  detail: string;
  announcement: string;
  pending?: boolean;
}

const ordinaryPauseMessage = (message: string | null) =>
  !message || message.startsWith('Manual control active.') || message.startsWith('Auto-walk paused.');

/** Compact scene guidance. It never intercepts canvas input. */
export function ManeuverOverlay({ document }: { document: PlanDocument }) {
  const session = usePlaybackStore((state) => state.session);
  const status = usePlaybackStore((state) => state.status);
  const snapshot = usePlaybackStore((state) => state.snapshot);
  const changed = usePlaybackStore((state) => state.changed);
  const message = usePlaybackStore((state) => state.message);
  const awaiting = usePlaybackStore((state) => state.awaiting);
  const recovering = usePlaybackStore((state) => state.recovering);
  const liveKey = usePlaybackStore((state) => state.liveKey);
  const pendingAcknowledgement = usePlaybackStore((state) => state.pendingAcknowledgement);
  const active = useWayfindingStore(selectActiveResult);

  if (session?.kind !== 'route' || !session.route) {
    return null;
  }

  const arrived = status === 'arrived';
  const routePoseCurrent = isWalkRoutePoseCurrent({
    path: session.runtime.path,
    distanceM: snapshot.distance,
    legIndex: session.runtime.leg,
    floorId: snapshot.floorId,
    position: [snapshot.x, snapshot.y, snapshot.z],
  });
  const routeChanged =
    changed || document !== session.source || (!!active && routeKey(active) !== liveKey);
  const movedOffRoute = status === 'paused' && !routePoseCurrent;
  const pauseNeedsAttention =
    status === 'paused' && !ordinaryPauseMessage(message);

  let notice: GuidanceNotice | null = null;
  if (!arrived && (awaiting || recovering || pendingAcknowledgement)) {
    notice = {
      label: recovering ? 'Finding a clear path' : 'Re-routing',
      title: 'Updating directions',
      detail: message ?? 'Calculating a route from your current position.',
      announcement: message ?? 'Updating directions from your current position.',
      pending: true,
    };
  } else if (!arrived && routeChanged) {
    notice = {
      label: 'Route update',
      title: 'Directions paused',
      detail: 'Re-route or keep the current path in walkthrough controls.',
      announcement: 'Directions paused because the route or layout changed.',
    };
  } else if (!arrived && pauseNeedsAttention) {
    notice = {
      label: 'Route paused',
      title: 'Directions unavailable',
      detail: message!,
      announcement: message!,
    };
  } else if (!arrived && movedOffRoute) {
    notice = {
      label: 'Off route',
      title: 'Recalculation needed',
      detail: 'Choose Recalculate & resume to continue from here.',
      announcement: 'You moved off route. Recalculate directions from your current position.',
    };
  }

  const destination = walkDestinationLabel(session.route);
  const maneuver = notice
    ? null
    : nextWalkManeuver({
        path: session.runtime.path,
        distanceM: snapshot.distance,
        legIndex: session.runtime.leg,
        arrived,
      });
  const copy = maneuver
    ? describeWalkManeuver(maneuver, session.document, destination, snapshot.phase)
    : null;
  const announcement = notice?.announcement ??
    (copy ? `${status === 'paused' ? 'Route paused. ' : ''}${copy.announcement}` : '');

  return (
    <section
      aria-label="Walking directions"
      className="pointer-events-none absolute left-1/2 top-3 z-20 w-[calc(100%-1rem)] max-w-md -translate-x-1/2 select-none"
    >
      <div
        aria-hidden="true"
        className="flex items-center gap-2.5 rounded-xl border bg-background/90 p-2.5 text-foreground shadow-lg backdrop-blur-md"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          {notice ? (
            notice.pending ? (
              <Route className="size-5" />
            ) : (
              <TriangleAlert className="size-5" />
            )
          ) : maneuver ? (
            <ManeuverIcon maneuver={maneuver} />
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-medium text-muted-foreground">
              {notice?.label ?? (maneuver?.kind === 'arrive' ? 'Destination' : 'Next direction')}
            </p>
            {!notice && status === 'paused' && <Badge variant="outline">Paused</Badge>}
          </div>
          <p className="truncate text-sm font-semibold leading-tight">
            {notice?.title ?? copy?.title}
          </p>
          {(notice?.detail || copy?.detail) && (
            <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
              {notice?.detail ?? copy?.detail}
            </p>
          )}
        </div>
        {!notice && copy?.metric && (
          <div className="shrink-0 text-right">
            <p className="text-base font-semibold tabular-nums">{copy.metric}</p>
            <p className="text-[0.65rem] text-muted-foreground">{copy.metricLabel}</p>
          </div>
        )}
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

function ManeuverIcon({ maneuver }: { maneuver: WalkManeuver }) {
  const props = { className: 'size-5' } as const;
  if (maneuver.kind === 'left') {
    return <ArrowLeft {...props} />;
  }
  if (maneuver.kind === 'right') {
    return <ArrowRight {...props} />;
  }
  if (maneuver.kind === 'connector') {
    return maneuver.verticalDirection === 'up' ? (
      <ArrowUp {...props} />
    ) : maneuver.verticalDirection === 'down' ? (
      <ArrowDown {...props} />
    ) : (
      <ArrowUpDown {...props} />
    );
  }
  if (maneuver.kind === 'arrive') {
    return <CheckCircle2 {...props} />;
  }
  return <ArrowUp {...props} />;
}
