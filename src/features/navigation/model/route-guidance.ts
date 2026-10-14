import { create } from 'zustand';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { avatarRuntime, type AvatarRoute } from '@/features/viewer/model/avatar-runtime.ts';
import { currentAvatarDestination } from './navigation-destinations.ts';
import { describeRoute, type RoutePlan } from './route-planner.ts';

export interface GuidanceError {
  code: 'ROUTE_BLOCKED' | 'NO_ROUTE' | 'ROUTE_FAILED';
  message: string;
}
interface GuidanceState {
  plan: RoutePlan | null;
  phase: 'idle' | 'starting' | 'walking' | 'retrying' | 'arrived' | 'cancelled' | 'error';
  remainingMetres: number;
  floorId: string;
  retries: number;
  error: GuidanceError | null;
  start: (plan: RoutePlan) => Promise<void>;
  cancel: () => void;
  dismiss: () => void;
}
interface RouteMetrics {
  suffix: number[];
  total: number;
}
const metrics = new WeakMap<AvatarRoute, RouteMetrics>();
let generation = 0;
let activeGeneration: number | null = null;
let ownedAttempt: number | null = null;
let origin = [...avatarRuntime.position] as [number, number, number];

function routeMetrics(route: AvatarRoute) {
  const cached = metrics.get(route);
  if (cached) {
    return cached;
  }
  const suffix = Array.from({ length: route.waypoints.length }, () => 0);
  for (let i = route.waypoints.length - 2; i >= 0; i--) {
    const a = route.waypoints[i]!;
    const b = route.waypoints[i + 1]!;
    suffix[i] = suffix[i + 1]! + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const value = { suffix, total: suffix[0] ?? 0 };
  metrics.set(route, value);
  return value;
}
function remainingDistance(route: AvatarRoute) {
  const cursor = Math.min(route.waypoints.length, Math.max(0, avatarRuntime.cursor));
  const target = route.waypoints[cursor];
  if (!target) {
    return 0;
  }
  const sameFloor = (route.floors?.[cursor] ?? avatarRuntime.floorId) === avatarRuntime.floorId;
  return (
    (routeMetrics(route).suffix[cursor] ?? 0) +
    Math.hypot(
      target[0] - avatarRuntime.position[0],
      sameFloor ? 0 : target[1] - avatarRuntime.position[1],
      target[2] - avatarRuntime.position[2],
    )
  );
}
function ownsCurrentWalk() {
  const guidance = useRouteGuidance.getState();
  const world = useWorldStore.getState();
  return (
    activeGeneration !== null &&
    !!guidance.plan &&
    (world.autopilot?.destinationId === guidance.plan.to.id ||
      (ownedAttempt === activeGeneration && activeGeneration !== null))
  );
}
async function attempt(token: number) {
  const guidance = useRouteGuidance.getState();
  const { plan } = guidance;
  if (!plan || activeGeneration !== token) {
    return;
  }
  ownedAttempt = token;
  origin = [...avatarRuntime.position];
  try {
    const world = useWorldStore.getState();
    const options = { enabledPortalTypes: plan.stepFree ? ['elevator' as const] : undefined };
    const started = await (plan.to.kind === 'point'
      ? world.startAutopilotToPoint(plan.to, options)
      : world.startAutopilot(plan.to.id, options));
    if (activeGeneration !== token) {
      return;
    }
    if (!started && useWorldStore.getState().routeStatus === 'idle') {
      activeGeneration = null;
      generation++;
      useRouteGuidance.setState({ phase: 'cancelled', error: null });
    }
  } catch (error) {
    if (activeGeneration !== token) {
      return;
    }
    activeGeneration = null;
    useRouteGuidance.setState({
      phase: 'error',
      error: {
        code: 'ROUTE_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    if (ownedAttempt === token) {
      ownedAttempt = null;
    }
  }
}

export const useRouteGuidance = create<GuidanceState>((set) => ({
  plan: null,
  phase: 'idle',
  remainingMetres: 0,
  floorId: '',
  retries: 0,
  error: null,
  start: async (plan) => {
    if (plan.from.kind !== 'avatar') {
      useRouteGuidance.getState().dismiss();
      set({
        plan,
        phase: 'error',
        error: {
          code: 'ROUTE_FAILED',
          message:
            'This route is a preview from another origin. Choose your current location to start walking.',
        },
      });
      return;
    }
    const token = ++generation;
    activeGeneration = token;
    set({
      plan,
      phase: 'starting',
      remainingMetres: plan.distanceMetres,
      floorId: avatarRuntime.floorId,
      retries: 0,
      error: null,
    });
    await attempt(token);
  },
  cancel: () => {
    const owned = ownsCurrentWalk();
    generation++;
    activeGeneration = null;
    set({ phase: 'cancelled', error: null });
    if (owned) {
      useWorldStore.getState().cancelAutopilot();
    }
  },
  dismiss: () => {
    const owned = ownsCurrentWalk();
    generation++;
    activeGeneration = null;
    set({ plan: null, phase: 'idle', remainingMetres: 0, error: null });
    if (owned) {
      useWorldStore.getState().cancelAutopilot();
    }
  },
}));

const unsubscribe = useWorldStore.subscribe((world, previous) => {
  const token = activeGeneration;
  const guidance = useRouteGuidance.getState();
  if (token === null || !guidance.plan) {
    return;
  }
  if (
    world.autopilot === previous.autopilot &&
    world.routeStatus === previous.routeStatus &&
    world.localAvatar === previous.localAvatar
  ) {
    return;
  }
  if (world.routeStatus === 'computing') {
    if (ownedAttempt !== token) {
      activeGeneration = null;
      generation++;
      useRouteGuidance.setState({ phase: 'cancelled', error: null });
    }
    return;
  }
  if (world.routeStatus === 'walking' && world.autopilot) {
    if (world.autopilot.destinationId !== guidance.plan.to.id) {
      activeGeneration = null;
      generation++;
      useRouteGuidance.setState({ phase: 'cancelled', error: null });
      return;
    }
    const plan =
      world.autopilot !== previous.autopilot
        ? {
            ...describeRoute(
              guidance.plan.layout,
              currentAvatarDestination(guidance.plan.layout, {
                floorId: world.autopilot.floors?.[0] ?? world.currentFloorId,
                position: origin,
              }),
              guidance.plan.to,
              {
                points: [...world.autopilot.waypoints],
                floors: [
                  ...(world.autopilot.floors ??
                    world.autopilot.waypoints.map(() => world.currentFloorId)),
                ],
              },
            ),
            stepFree: guidance.plan.stepFree,
          }
        : guidance.plan;
    useRouteGuidance.setState({
      plan,
      phase: 'walking',
      remainingMetres: remainingDistance(world.autopilot),
      floorId: world.currentFloorId,
      error: null,
    });
    return;
  }
  if (world.routeStatus === 'blocked') {
    if (guidance.retries === 0) {
      useRouteGuidance.setState({
        phase: 'retrying',
        retries: 1,
        floorId: world.currentFloorId,
        error: null,
      });
      queueMicrotask(() => {
        if (
          activeGeneration === token &&
          useRouteGuidance.getState().phase === 'retrying' &&
          useWorldStore.getState().routeStatus === 'blocked'
        ) {
          void attempt(token);
        }
      });
    } else {
      activeGeneration = null;
      useRouteGuidance.setState({
        phase: 'error',
        error: {
          code: 'ROUTE_BLOCKED',
          message:
            'The route remains blocked after one retry. Check the obstruction or choose another destination.',
        },
      });
    }
    return;
  }
  if (world.routeStatus === 'no-route' || world.routeStatus === 'error') {
    activeGeneration = null;
    useRouteGuidance.setState({
      phase: 'error',
      error: {
        code: guidance.retries
          ? 'ROUTE_BLOCKED'
          : world.routeStatus === 'no-route'
            ? 'NO_ROUTE'
            : 'ROUTE_FAILED',
        message: world.routeError ?? 'The route could not be started.',
      },
    });
    return;
  }
  if (world.routeStatus === 'idle') {
    const target = previous.autopilot?.waypoints.at(-1);
    const targetFloor = previous.autopilot?.floors?.at(-1) ?? guidance.plan.to.floorId;
    const arrived =
      previous.routeStatus === 'walking' &&
      target &&
      world.currentFloorId === targetFloor &&
      Math.hypot(
        world.localAvatar.position[0] - target[0],
        world.localAvatar.position[2] - target[2],
      ) < 0.05;
    activeGeneration = null;
    generation++;
    useRouteGuidance.setState({
      phase: arrived ? 'arrived' : 'cancelled',
      ...(arrived ? { remainingMetres: 0 } : {}),
      floorId: world.currentFloorId,
      error: null,
    });
  }
});
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribe();
    useRouteGuidance.getState().dismiss();
  });
}
