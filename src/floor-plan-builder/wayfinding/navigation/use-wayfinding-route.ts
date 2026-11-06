import type { CollisionMap } from '../walkthrough/collision/capsule-clearance.ts';
import { CHARACTER_CONFIG } from '../walkthrough/character-config.ts';
import { usePlaybackStore } from '../store/playback-store.ts';
import { compilePath } from '../walkthrough/path.ts';
import { createFollower } from '../walkthrough/follower.ts';
import { useEffect, useMemo, useRef } from 'react';
import { StudioNavigator } from '../../model/directions.ts';
import type { PlanDocument } from '../../model/types.ts';
import { planWayfindingRoute } from './route-service.ts';
import { useWayfindingStore } from '../store/wayfinding-store.ts';
import type { WalkableZone } from '../model/zone-schema.ts';
import type { Role } from '../walkthrough/contracts.ts';
import {
  EMPTY_ROUTE_NAVIGATION_POLICY,
  routeNavigationPolicyKey,
  type RouteNavigationPolicySource,
} from '../walkthrough/permissions/route-navigation-policy.ts';

/**
 * Runs explicitly submitted route requests against the live document. Geometry
 * and access changes invalidate the preview until the next Fetch route. Role defaults to
 * visitor so existing call sites fail closed; Studio must pass its selected role.
 */
export function useWayfindingRoute(
  document: PlanDocument,
  revision: number,
  zones: WalkableZone[],
  notify: (message: string) => void,
  role: Role = 'visitor',
  rolePolicy: RouteNavigationPolicySource = EMPTY_ROUTE_NAVIGATION_POLICY,
) {
  const routeScope = useRef<string | null>(null);
  const scopeLifecycle = useRef(0);
  useEffect(() => {
    const lifecycle = ++scopeLifecycle.current;
    if (routeScope.current !== document.baseline.buildingId) {
      routeScope.current = document.baseline.buildingId;
      useWayfindingStore.getState().clear();
    }
    return () => {
      // Synchronous Suspense/StrictMode reconnects retain this route owner.
      queueMicrotask(() => {
        if (scopeLifecycle.current === lifecycle) { useWayfindingStore.getState().clear(); }
      });
    };
  }, [document.baseline.buildingId]);
  const request = useWayfindingStore((state) => state.submittedRequest);
  const setOutcome = useWayfindingStore((state) => state.setOutcome);
  const setStatus = useWayfindingStore((state) => state.setStatus);
  const navigator = useMemo(() => new StudioNavigator(), []);
  const runId = useRef(0);
  const policyKey = routeNavigationPolicyKey(rolePolicy);
  const previousContext = useRef({ document, revision, zones, role, policyKey });
  const recoveryAttempts = useRef(new WeakMap<object, number>());

  useEffect(() => () => navigator.dispose(), [navigator]);

  useEffect(() => {
    let controller: AbortController | null = null;
    const attempts = recoveryAttempts.current;
    const recover = (map: CollisionMap, blockerId?: string) => {
      const state = usePlaybackStore.getState();
      const { session } = state;
      if (!session || state.status !== 'playing' || state.recovering) {return;}
      const route = session.route;
      if (!route) {return;}
      const count = attempts.get(session.runtime) ?? 0;
      if (count >= 3) {state.fail('Walking stopped safely. I could not find another clear route to your destination.'); return;}
      attempts.set(session.runtime, count + 1);
      const { runtime } = session;
      const position = [...runtime.position] as [number, number, number];
      const destination = session.destination;
      if (!destination) {state.fail('Walking stopped safely. Please plan your destination again.'); return;}
      const { seekVersion } = runtime;
      controller?.abort();
      const active = new AbortController();
      controller = active;
      usePlaybackStore.setState({ recovering: true, message: 'Finding another clear passage...' });
      // The same navigator/worker and captured access context own every query.
      const recoveryDocument = { ...document, floors: document.floors.map((floor) => floor.source.id !== map.floorId ? floor : ({ ...floor,
        zones: [...floor.zones, ...[...map.obstacles, ...map.blockedAreas].filter((obstacle) => (!blockerId || obstacle.id === blockerId) && obstacle.minY < map.floorY + CHARACTER_CONFIG.heightM && obstacle.maxY > map.floorY).map((obstacle) => {
          const xs = obstacle.polygon.map(([x]) => x), zs = obstacle.polygon.map(([, z]) => z);
          const margin = 0.05 * (count + 1);
          const x0 = Math.min(...xs) - margin, x1 = Math.max(...xs) + margin;
          const z0 = Math.min(...zs) - margin, z1 = Math.max(...zs) + margin;
          return { id: `runtime-recovery:${obstacle.id}`, label: 'Blocked passage', type: 'blocked' as const,
            polygon: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as [number, number][] };
        })],
      })) };
      const ownsRecovery = () => controller === active && !active.signal.aborted &&
        usePlaybackStore.getState().session?.runtime === runtime && usePlaybackStore.getState().recovering;
      // Invalidate synchronously, before a cancelled query can commit after resume.
      const unsubscribe = usePlaybackStore.subscribe((current) => {
        if (controller === active && (current.session?.runtime !== runtime || !current.recovering ||
          current.status !== 'playing' || runtime.seekVersion !== seekVersion)) {active.abort();}
      });
      const timeout = setTimeout(() => {
        const owned = ownsRecovery();
        active.abort();
        if (owned) {
          usePlaybackStore.getState().fail('Walking stopped safely. Finding another passage took too long. Please try again.');
        }
      }, 8000);
      void planWayfindingRoute(navigator, recoveryDocument, zones, {
        start: { kind: 'point', floorId: runtime.floorId, point: [position[0], position[2]] },
        dest: structuredClone(destination),
        accessibleOnly: route.option === 'accessible', allowRestricted: role === 'staff',
      }, active.signal, role, rolePolicy).then((outcome) => {
        const current = usePlaybackStore.getState();
        if (!ownsRecovery() || current.status !== 'playing' || runtime.seekVersion !== seekVersion) {return;}
        const nextRoute = outcome.options[route.option];
        if (!nextRoute) {current.fail(outcome.failures?.[route.option] ?? outcome.failure ?? 'Walking stopped safely. I could not find another clear route to your destination.'); return;}
        const next = createFollower(compilePath(nextRoute, document));
        if (Math.hypot(...next.position.map((v, i) => v - position[i]!)) > 0.001) {
          current.fail('Walking stopped safely. A clear passage from your current position is unavailable.'); return;
        }
        Object.assign(runtime, next, { position, speed: 0, yaw: runtime.yaw, yawVelocity: runtime.yawVelocity,
          gaitDistance: runtime.gaitDistance, seekVersion: seekVersion + 1, renderCommits: runtime.renderCommits });
        usePlaybackStore.setState({ session: { ...current.session!, route: nextRoute }, recovering: false, message: null });
        current.publish(runtime);
      }).catch(() => {
        if (ownsRecovery()) {
          usePlaybackStore.getState().fail('Walking stopped safely. Please try again when the passage is clear.');
        }
      }).finally(() => {clearTimeout(timeout); unsubscribe(); if (controller === active) {controller = null;} });
    };
    usePlaybackStore.setState({ recover });
    return () => {
      controller?.abort();
      if (usePlaybackStore.getState().recover === recover) {
        if (usePlaybackStore.getState().recovering) {usePlaybackStore.getState().fail('Walking stopped because the route or access rules changed.');}
        usePlaybackStore.setState({ recover: null });
      }
    };
  }, [navigator, document, zones, role, policyKey]);


  useEffect(() => {
    const previous = previousContext.current;
    const contextChanged = previous.document !== document || previous.revision !== revision ||
      previous.zones !== zones || previous.role !== role || previous.policyKey !== policyKey;
    previousContext.current = { document, revision, zones, role, policyKey };
    if (contextChanged) {
      runId.current++;
      navigator.cancel();
      useWayfindingStore.getState().invalidateRoute();
      return;
    }
    if (!request) {
      runId.current++;
      navigator.cancel();
      return;
    }
    const floorIds = new Set(document.floors.map((floor) => floor.source.id));
    if (!floorIds.has(request.start.floorId) || !floorIds.has(request.dest.floorId)) {
      runId.current++;
      navigator.cancel();
      useWayfindingStore.getState().clear();
      return;
    }
    const id = ++runId.current;
    const controller = new AbortController();
    setStatus('routing');
    const run = () => {
      planWayfindingRoute(navigator, document, zones, request, controller.signal, role, rolePolicy)
        .then((outcome) => {
          if (runId.current !== id || controller.signal.aborted ||
            useWayfindingStore.getState().submittedRequest !== request) {
            return;
          }
          setOutcome(outcome);
          if (outcome.failure) {
            notify(outcome.failure);
          }
        })
        .catch((error: unknown) => {
          if (runId.current !== id || controller.signal.aborted ||
            useWayfindingStore.getState().submittedRequest !== request) {
            return;
          }
          setOutcome({
            request,
            options: {},
            failure: error instanceof Error ? error.message : String(error),
          });
        });
    };
    run();
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, revision, document, zones, navigator, role, policyKey]);
}
