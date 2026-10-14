import { create } from 'zustand';
import type { NormalizedLayout } from '@/features/building/model/normalize-layout.ts';
import type { BuildingRoute } from '@/features/building/model/navigation-protocol.ts';
import { queryBuildingRouteAsync } from '@/features/building/model/navigation-client.ts';
import { isFloorPointClear } from '@/features/building/model/floor-point-clear.ts';
import { rememberDestination } from './wayfinding-preferences.ts';
import { reportTelemetry } from '@/features/venue/model/venue-client.ts';
import {
  resolveNavigationDestination,
  type NavigationDestination,
  currentAvatarDestination,
  getNavigationDestinations,
} from './navigation-destinations.ts';

export interface RouteStep {
  label: string;
  floorId: string;
  distanceMetres: number;
  kind: 'walk' | 'transfer' | 'arrival';
}
export interface RoutePlan {
  layout: NormalizedLayout;
  from: NavigationDestination;
  to: NavigationDestination;
  route: NonNullable<BuildingRoute>;
  distanceMetres: number;
  walkingSeconds: number;
  transferCount: number;
  steps: RouteStep[];
  stepFree?: boolean;
}
export interface RoutePreviewOptions {
  currentAvatar?: { floorId: string; position: [number, number, number] };
  stepFree?: boolean;
  fromPoint?: NavigationDestination;
  toPoint?: NavigationDestination;
  /** Venue event for aggregate route analytics; omitted when unevented. */
  eventId?: string;
}

/** Route previews use actual Recast points/portal transitions, never straight-line shortcuts. */
export function describeRoute(
  layout: NormalizedLayout,
  from: NavigationDestination,
  to: NavigationDestination,
  route: NonNullable<BuildingRoute>,
): RoutePlan {
  const floorName = (id: string) => layout.floors.find((floor) => floor.id === id)?.name ?? id;
  const steps: RouteStep[] = [];
  let distanceMetres = 0;
  let walkingDistance = 0;
  let transferCount = 0;
  let legDistance = 0;
  let legFloor = route.floors[0] ?? from.floorId;
  const flushWalk = () => {
    if (legDistance < 0.01) {
      return;
    }
    steps.push({
      kind: 'walk',
      floorId: legFloor,
      distanceMetres: legDistance,
      label: `Walk ${Math.round(legDistance)} m on ${floorName(legFloor)}`,
    });
    legDistance = 0;
  };
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]!;
    const b = route.points[i]!;
    const aFloor = route.floors[i - 1] ?? legFloor;
    const bFloor = route.floors[i] ?? aFloor;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    distanceMetres += length;
    if (aFloor !== bFloor) {
      flushWalk();
      const portal = layout.portals.find((candidate) => {
        const entryA = candidate.entries?.find((entry) => entry.floorId === aFloor);
        const entryB = candidate.entries?.find((entry) => entry.floorId === bFloor);
        return (
          entryA &&
          entryB &&
          Math.hypot(entryA.position[0] - a[0], entryA.position[1] - a[2]) < 1 &&
          Math.hypot(entryB.position[0] - b[0], entryB.position[1] - b[2]) < 1
        );
      });
      transferCount++;
      if (portal?.type !== 'elevator') {
        walkingDistance += length;
      }
      steps.push({
        kind: 'transfer',
        floorId: bFloor,
        distanceMetres: length,
        label: `Take ${portal?.type ?? 'the connection'} from ${floorName(aFloor)} to ${floorName(bFloor)}${portal ? ` (${portal.id})` : ''}`,
      });
      legFloor = bFloor;
    } else {
      legFloor = aFloor;
      legDistance += length;
      walkingDistance += length;
    }
  }
  flushWalk();
  steps.push({
    kind: 'arrival',
    floorId: to.floorId,
    distanceMetres: 0,
    label: `Arrive at ${to.label}`,
  });
  return {
    layout,
    from,
    to,
    route,
    distanceMetres,
    walkingSeconds: walkingDistance / 1.3,
    transferCount,
    steps,
  };
}

interface PlannerState {
  status: 'idle' | 'computing' | 'ready' | 'no-route' | 'error' | 'cancelled';
  error: string | null;
  plan: RoutePlan | null;
  preview: (
    layout: NormalizedLayout,
    fromId: string,
    toId: string,
    options?: RoutePreviewOptions,
  ) => Promise<void>;
  clear: () => void;
  cancel: () => void;
  nearest: (
    layout: NormalizedLayout,
    category: string,
    avatar: { floorId: string; position: [number, number, number] },
    stepFree: boolean,
    eventId?: string,
  ) => Promise<void>;
}
let generation = 0;
let active: AbortController | null = null;
export const useRoutePlanner = create<PlannerState>((set) => ({
  status: 'idle',
  error: null,
  plan: null,
  preview: async (layout, fromId, toId, options = {}) => {
    active?.abort();
    const request = ++generation;
    const controller = new AbortController();
    active = controller;
    const from = options.currentAvatar
      ? currentAvatarDestination(layout, options.currentAvatar)
      : options.fromPoint?.kind === 'point' && options.fromPoint.id === fromId
        ? options.fromPoint
        : resolveNavigationDestination(layout, fromId);
    const to =
      options.toPoint?.kind === 'point' && options.toPoint.id === toId
        ? options.toPoint
        : resolveNavigationDestination(layout, toId);
    if (!from || !to) {
      active = null;
      set({ plan: null, status: 'error', error: 'Choose two available destinations.' });
      return;
    }
    if (from.id === to.id) {
      active = null;
      set({ plan: null, status: 'error', error: 'Choose different start and destination places.' });
      return;
    }
    if (
      [from, to].some(
        (destination) =>
          destination.kind === 'point' &&
          !isFloorPointClear(layout, destination.floorId, [
            destination.position[0],
            destination.position[2],
          ]),
      )
    ) {
      active = null;
      set({
        plan: null,
        status: 'no-route',
        error: 'The chosen floor point is outside a clear walkable area.',
      });
      return;
    }
    set({ plan: null, status: 'computing', error: null });
    try {
      const route = await queryBuildingRouteAsync(
        layout,
        from.floorId,
        from.position,
        to.floorId,
        to.position,
        {
          signal: controller.signal,
          ...(options.stepFree ? { enabledPortalTypes: ['elevator'] as const } : {}),
        },
      );
      if (request !== generation || controller.signal.aborted) {
        return;
      }
      set(
        route
          ? {
              plan: { ...describeRoute(layout, from, to, route), stepFree: !!options.stepFree },
              status: 'ready',
              error: null,
            }
          : {
              plan: null,
              status: 'no-route',
              error: `${options.stepFree ? 'No step-free route' : 'No walkable route'} connects ${from.label} and ${to.label}. Check obstacles and ${options.stepFree ? 'elevator' : 'portal'} entries.`,
            },
      );
      if (route) {
        rememberDestination(layout, to.id);
        reportTelemetry(options.eventId, [{ kind: 'route' }]);
      }
    } catch (error) {
      if (request !== generation) {
        return;
      }
      const cancelled =
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        error.name === 'AbortError';
      set({
        plan: null,
        status: cancelled ? 'cancelled' : 'error',
        error: cancelled
          ? 'Route preview was interrupted. Try again.'
          : error instanceof Error
            ? error.message
            : String(error),
      });
    } finally {
      if (active === controller) {
        active = null;
      }
    }
  },
  nearest: async (layout, category, avatar, stepFree, eventId) => {
    active?.abort();
    const request = ++generation;
    const controller = new AbortController();
    active = controller;
    set({ plan: null, status: 'computing', error: null });
    const from = currentAvatarDestination(layout, avatar);
    const candidates = getNavigationDestinations(layout).filter(
      (item) => item.amenity === category || item.category === category,
    );
    let best: RoutePlan | null = null;
    try {
      // Evaluate every reachable destination through the shared Recast worker. Euclidean proximity is not proof of a shortest walking route.
      for (const to of candidates) {
        if (request !== generation || controller.signal.aborted) {
          return;
        }
        if (!isFloorPointClear(layout, to.floorId, [to.position[0], to.position[2]])) {
          continue;
        }
        const route = await queryBuildingRouteAsync(
          layout,
          from.floorId,
          from.position,
          to.floorId,
          to.position,
          {
            signal: controller.signal,
            ...(stepFree ? { enabledPortalTypes: ['elevator'] as const } : {}),
          },
        );
        if (!route) {
          continue;
        }
        const plan = { ...describeRoute(layout, from, to, route), stepFree };
        if (!best || plan.distanceMetres < best.distanceMetres) {
          best = plan;
        }
      }
      if (request !== generation || controller.signal.aborted) {
        return;
      }
      set({
        plan: best,
        status: best ? 'ready' : 'no-route',
        error: best
          ? null
          : candidates.length
            ? `No ${stepFree ? 'step-free ' : ''}route reaches an authored ${category}.`
            : `No ${category} destinations have been authored.`,
      });
      if (best) {
        rememberDestination(layout, best.to.id);
        reportTelemetry(eventId, [{ kind: 'route' }]);
      }
    } catch (error) {
      if (request === generation) {
        set({
          plan: null,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      if (active === controller) {
        active = null;
      }
    }
  },
  clear: () => {
    generation++;
    active?.abort();
    active = null;
    set({ status: 'idle', error: null, plan: null });
  },
  cancel: () => {
    generation++;
    active?.abort();
    active = null;
    set({ status: 'cancelled', error: 'Route preview cancelled.', plan: null });
  },
}));
if (import.meta.hot) {
  import.meta.hot.dispose(() => useRoutePlanner.getState().clear());
}
