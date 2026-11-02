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
 * Runs route requests against the live document. Re-plans (debounced) when
 * the document revision changes under an active route and reports a
 * non-blocking "updating routes" state via status=routing. Role defaults to
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
  useEffect(() => {
    useWayfindingStore.getState().clear();
    return () => useWayfindingStore.getState().clear();
  }, [document.baseline.buildingId]);
  const request = useWayfindingStore((state) => state.request);
  const setOutcome = useWayfindingStore((state) => state.setOutcome);
  const setStatus = useWayfindingStore((state) => state.setStatus);
  const navigator = useMemo(() => new StudioNavigator(), []);
  const runId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const policyKey = routeNavigationPolicyKey(rolePolicy);
  const previousAccess = useRef({ role, policyKey });

  useEffect(() => () => navigator.dispose(), [navigator]);

  useEffect(() => {
    const accessChanged = previousAccess.current.role !== role || previousAccess.current.policyKey !== policyKey;
    previousAccess.current = { role, policyKey };
    if (accessChanged) {
      // Do not display an outcome computed for a more permissive prior role while replanning.
      setOutcome(null);
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
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // First plan is immediate; document edits re-plan debounced.
    const previous = useWayfindingStore.getState().outcome;
    const hadOutcome = !accessChanged &&
      !!previous &&
      Object.values(previous.options).every((route) =>
        route.segments.every((segment) => floorIds.has(segment.floorId)),
      );
    if (previous && !hadOutcome) {
      setOutcome(null);
    }
    setStatus('routing');
    const run = () => {
      planWayfindingRoute(navigator, document, zones, request, controller.signal, role, rolePolicy)
        .then((outcome) => {
          if (runId.current !== id || controller.signal.aborted) {
            return;
          }
          setOutcome(outcome);
          if (outcome.failure) {
            notify(outcome.failure);
          }
        })
        .catch((error: unknown) => {
          if (runId.current !== id || controller.signal.aborted) {
            return;
          }
          setOutcome({
            request,
            options: {},
            failure: error instanceof Error ? error.message : String(error),
          });
        });
    };
    if (hadOutcome) {
      timer.current = setTimeout(run, 600);
    } else {
      run();
    }
    return () => {
      controller.abort();
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, revision, document, zones, navigator, role, policyKey]);
}
