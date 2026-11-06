import { useEffect, useRef } from 'react';
import { pointInPolygon } from '@/utils/geometry/polygon.ts';
import type { PlanDocument } from '../../../model/types.ts';
import type { RouteRequest } from '../../model/route-schema.ts';
import type { WalkableZone } from '../../model/zone-schema.ts';
import { usePlaybackStore } from '../../store/playback-store.ts';
import { useWayfindingStore } from '../../store/wayfinding-store.ts';

interface PendingResumeRoute {
  id: number;
  sessionGeneration: number;
  option: 'shortest' | 'accessible';
  request: RouteRequest;
}

/** Owns the single generation-safe Resume handshake with the existing route planner. */
export function ResumeController({
  document,
  zones,
  nextZones,
}: {
  document: PlanDocument;
  zones?: readonly WalkableZone[];
  nextZones?: readonly WalkableZone[];
}) {
  const session = usePlaybackStore((state) => state.session);
  const resumeRequest = usePlaybackStore((state) => state.resumeRequest);
  const routeStatus = useWayfindingStore((state) => state.status);
  const outcome = useWayfindingStore((state) => state.outcome);
  const submittedRequest = useWayfindingStore((state) => state.submittedRequest);
  const pending = useRef<PendingResumeRoute | null>(null);

  useEffect(() => {
    if (
      !resumeRequest ||
      session?.kind !== 'route' ||
      !session.route ||
      !session.destination ||
      resumeRequest.sessionGeneration !== session.generation ||
      pending.current?.id === resumeRequest.id
    ) {
      return;
    }
    const { runtime } = session;
    const floor = session.document.floors.find((item) => item.source.id === runtime.floorId);
    const floorZones = zones
      ? zones
          .filter((zone) => zone.floorId === runtime.floorId && zone.type === 'general')
          .map((zone) => ({ polygon: zone.polygon, holes: zone.holes }))
      : (floor?.zones ?? [])
          .filter((zone) => zone.type === 'walkable')
          .map((zone) => ({ polygon: zone.polygon, holes: [] as [number, number][][] }));
    if (
      !floorZones.some((zone) => {
        const point: [number, number] = [runtime.position[0], runtime.position[2]];
        return (
          pointInPolygon(point, zone.polygon) &&
          !zone.holes.some((hole) => pointInPolygon(point, hole))
        );
      })
    ) {
      usePlaybackStore
        .getState()
        .failResume(
          resumeRequest.id,
          floorZones.length
            ? 'Auto-walk cannot resume because you are outside every walkable zone. Walk back into a walkable zone, then choose Resume again.'
            : 'Auto-walk cannot resume because this floor has no walkable zone. Keep walking manually, or add a walkable zone before trying again.',
        );
      return;
    }
    const request: RouteRequest = {
      start: {
        floorId: runtime.floorId,
        kind: 'point',
        point: [runtime.position[0], runtime.position[2]],
      },
      dest: structuredClone(session.destination),
      ...session.constraints,
    };
    const wayfinding = useWayfindingStore.getState();
    wayfinding.setOption(session.route.option);
    wayfinding.setRequest(request);
    wayfinding.fetchRoute();
    const submitted = useWayfindingStore.getState().submittedRequest;
    if (!submitted) {
      usePlaybackStore.getState().failResume(resumeRequest.id, 'Unable to submit the updated route. Try Resume again.');
      return;
    }
    pending.current = {
      id: resumeRequest.id,
      sessionGeneration: session.generation,
      option: session.route.option,
      request: submitted,
    };
  }, [resumeRequest, session, zones]);

  useEffect(() => {
    const owned = pending.current;
    if (owned && resumeRequest?.id === owned.id && useWayfindingStore.getState().submittedRequest !== owned.request) {
      pending.current = null;
      usePlaybackStore.getState().failResume(owned.id, 'The route changed while resuming. Try Resume again.');
      return;
    }
    if (
      !owned ||
      !resumeRequest ||
      owned.id !== resumeRequest.id ||
      routeStatus === 'routing' ||
      !outcome ||
      outcome.request !== owned.request
    ) {
      return;
    }
    pending.current = null;
    const route = outcome.options[owned.option];
    if (route) {
      const navigationZones = nextZones ?? document.floors.flatMap((floor) =>
        floor.zones
          .filter((zone) => zone.type === 'walkable')
          .map((zone) => ({
            id: zone.id,
            floorId: floor.source.id,
            name: zone.label || 'Walkable zone',
            type: 'general' as const,
            polygon: zone.polygon as [number, number][],
            holes: [],
            revision: 0,
          })),
      );
      usePlaybackStore.getState().acceptResume(owned.id, route, document, owned.request, navigationZones);
    } else {
      usePlaybackStore
        .getState()
        .failResume(
          owned.id,
          outcome.failures?.[owned.option] ??
            outcome.failure ??
            'No updated route is available from your current position. Stay in free walk and try again from a clear walkable zone.',
        );
    }
  }, [resumeRequest, routeStatus, outcome, submittedRequest, document, nextZones]);

  useEffect(() => {
    if (
      pending.current &&
      (!resumeRequest ||
        !session ||
        pending.current.id !== resumeRequest.id ||
        pending.current.sessionGeneration !== session.generation)
    ) {
      const wayfinding = useWayfindingStore.getState();
      if (wayfinding.submittedRequest === pending.current.request) {
        wayfinding.invalidateRoute();
      }
      pending.current = null;
    }
  }, [resumeRequest, session]);

  useEffect(
    () => () => {
      const owned = pending.current;
      const wayfinding = useWayfindingStore.getState();
      if (owned && wayfinding.submittedRequest === owned.request) {
        wayfinding.invalidateRoute();
      }
    },
    [],
  );

  return null;
}
