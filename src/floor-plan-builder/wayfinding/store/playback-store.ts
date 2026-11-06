import { destinationForRoute } from '../navigation/route-service.ts';
import type { RouteRequest } from '../model/route-schema.ts';
import type { CollisionMap } from '../walkthrough/collision/capsule-clearance.ts';
import { create } from 'zustand';
import { z } from 'zod';
import type { PlanDocument } from '../../model/types.ts';
import { routeResultSchema, type RouteResult } from '../model/route-schema.ts';
import { compilePath } from '../walkthrough/path.ts';
import { createFollower, seekFollower, type Follower } from '../walkthrough/follower.ts';
import { createFreeWalkRuntime } from '../walkthrough/runtime/free-walk-runtime.ts';
import { walkableZoneSchema, type WalkableZone } from '../model/zone-schema.ts';

export const cameraModeSchema = z.enum(['overview', 'chase', 'first']);
export type CameraMode = z.infer<typeof cameraModeSchema>;
export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'arrived';
export interface PlaybackSession {
  kind: 'route' | 'free';
  route: RouteResult | null;
  destination?: RouteRequest['dest'];
  constraints: Pick<RouteRequest, 'accessibleOnly' | 'allowRestricted'>;
  spawnStatus: 'pending' | 'ready';
  document: PlanDocument;
  source: PlanDocument;
  navigationZones?: readonly WalkableZone[];
  runtime: Follower;
  initialFloor: string;
  generation: number;
}
export interface PlaybackSnapshot {
  progress: number;
  distance: number;
  speed: number;
  floorId: string;
  phase: string;
  x: number;
  y: number;
  z: number;
  remaining: number;
}
const empty: PlaybackSnapshot = {
  progress: 0,
  distance: 0,
  speed: 0,
  floorId: '',
  phase: 'Ready',
  x: 0,
  y: 0,
  z: 0,
  remaining: 0,
};
export function snapshotOf(runtime: Follower): PlaybackSnapshot {
  return {
    progress: runtime.progress,
    distance: runtime.distance,
    speed: runtime.speed,
    floorId: runtime.floorId,
    phase: runtime.phase,
    x: runtime.position[0],
    y: runtime.position[1],
    z: runtime.position[2],
    remaining: Math.max(0, runtime.path.length - runtime.distance),
  };
}
interface PlaybackState {
  cameraAudit: { positionError: number; rotationError: number } | null;
  liveKey: string;
  pendingAcknowledgement: boolean;
  session: PlaybackSession | null;
  status: PlaybackStatus;
  mode: CameraMode;
  speed: number;
  comfort: boolean;
  snapshot: PlaybackSnapshot;
  changed: boolean;
  message: string | null;
  awaiting: boolean;
  recovering: boolean;
  recover: ((map: CollisionMap, blockerId?: string) => void) | null;
  resumeRequest: { id: number; sessionGeneration: number } | null;
  begin: (route: RouteResult, document: PlanDocument, floorId: string, request?: RouteRequest, navigationZones?: readonly WalkableZone[]) => void;
  beginFreeWalk: (document: PlanDocument, floorId: string, spawn: readonly [number, number], navigationZones?: readonly WalkableZone[]) => void;
  pinNavigationZones: (sessionGeneration: number, navigationZones: readonly WalkableZone[]) => void;
  confirmFreeWalk: (sessionGeneration: number) => void;
  rejectFreeWalk: (sessionGeneration: number, message: string) => void;
  exit: () => void;
  toggle: () => void;
  takeManualControl: (message?: string) => void;
  resume: () => void;
  acceptResume: (id: number, route: RouteResult, document: PlanDocument, request: RouteRequest, navigationZones?: readonly WalkableZone[]) => void;
  failResume: (id: number, message: string) => void;
  seek: (progress: number) => void;
  setMode: (mode: CameraMode) => void;
  setSpeed: (speed: number) => void;
  setComfort: (value: boolean) => void;
  publish: (runtime: Follower) => void;
  markChanged: () => void;
  keep: (document: PlanDocument, route?: RouteResult | null, pending?: boolean) => void;
  accept: (route: RouteResult, document: PlanDocument) => void;
  wait: () => void;
  fail: (message: string) => void;
}
let generation = 0;
let resumeOperation = 0;
const cloneNavigationZones = (zones?: readonly WalkableZone[]) =>
  zones === undefined ? undefined : walkableZoneSchema.array().parse(structuredClone(zones));
export const routeKey = (route: RouteResult | null) =>
  route ? `${route.option}:${JSON.stringify(route.waypoints)}` : 'none';
export const routeForPlaybackSession = (
  session: PlaybackSession | null,
  liveRoute: RouteResult | null,
): RouteResult | null => session ? (session.kind === 'route' ? session.route : null) : liveRoute;
export const usePlaybackStore = create<PlaybackState>()((set, get) => ({
  liveKey: 'none',
  pendingAcknowledgement: false,
  session: null,
  status: 'idle',
  mode: 'overview',
  speed: 1,
  comfort: false,
  snapshot: empty,
  changed: false,
  message: null,
  awaiting: false,
  recovering: false,
  recover: null,
  resumeRequest: null,
  cameraAudit: null,
  begin: (route, document, floorId, request, navigationZones) => {
    try {
      const checked = routeResultSchema.parse(route),
        pinned = structuredClone(document),
        pinnedZones = cloneNavigationZones(navigationZones),
        runtime = createFollower(compilePath(checked, pinned)),
        destination = request?.dest ?? destinationForRoute(route);
      resumeOperation++;
      set({
        session: {
          kind: 'route',
          route: checked,
          destination: destination ? structuredClone(destination) : undefined,
          constraints: {
            accessibleOnly: request?.accessibleOnly === true || checked.option === 'accessible',
            allowRestricted: request?.allowRestricted ?? false,
          },
          spawnStatus: 'ready',
          document: pinned,
          source: document,
          navigationZones: pinnedZones,
          runtime,
          initialFloor: floorId,
          generation: ++generation,
        },
        status: 'playing',
        recovering: false,
        mode: 'first',
        liveKey: routeKey(route),
        pendingAcknowledgement: false,
        snapshot: snapshotOf(runtime),
        changed: false,
        message: null,
        awaiting: false,
        resumeRequest: null,
        cameraAudit: null,
      });
    } catch (error) {
      set({
        message: error instanceof Error ? error.message : 'Unable to start walkthrough.',
        awaiting: false,
        status: get().session ? 'paused' : 'idle',
      });
    }
  },
  beginFreeWalk: (document, floorId, spawn, navigationZones) => {
    try {
      const floor = document.floors.find((item) => item.source.id === floorId);
      if (!floor || spawn.length !== 2 || ![...spawn, floor.source.heightOffset].every(Number.isFinite)) {
        set({ message: 'Free walk cannot start because the selected start point is invalid.' });
        return;
      }
      const pinned = structuredClone(document);
      const pinnedZones = cloneNavigationZones(navigationZones);
      const runtime = createFreeWalkRuntime(
        [spawn[0], floor.source.heightOffset, spawn[1]],
        floorId,
      );
      resumeOperation++;
      set({
        session: {
          kind: 'free',
          route: null,
          constraints: { accessibleOnly: false, allowRestricted: false },
          spawnStatus: 'pending',
          document: pinned,
          source: document,
          navigationZones: pinnedZones,
          runtime,
          initialFloor: floorId,
          generation: ++generation,
        },
        status: 'paused',
        recovering: false,
        mode: 'first',
        liveKey: 'none',
        pendingAcknowledgement: false,
        snapshot: snapshotOf(runtime),
        changed: false,
        message: 'Checking the selected start point for capsule clearance and physical support…',
        awaiting: false,
        resumeRequest: null,
        cameraAudit: null,
      });
    } catch (error) {
      set({
        message: error instanceof Error ? error.message : 'Unable to start free walk.',
        awaiting: false,
        status: get().session ? 'paused' : 'idle',
      });
    }
  },
  pinNavigationZones: (sessionGeneration, navigationZones) => {
    try {
      const pinnedZones = cloneNavigationZones(navigationZones);
      set((state) => state.session?.generation === sessionGeneration
        ? { session: { ...state.session, navigationZones: pinnedZones } }
        : state);
    } catch (error) {
      set((state) => state.session?.generation === sessionGeneration
        ? {
            status: 'paused',
            recovering: false,
            awaiting: false,
            message: error instanceof Error
              ? `Walkthrough stopped because its walkable zones are invalid. ${error.message}`
              : 'Walkthrough stopped because its walkable zones are invalid.',
          }
        : state);
    }
  },
  confirmFreeWalk: (sessionGeneration) =>
    set((state) =>
      state.session?.kind === 'free' &&
      state.session.generation === sessionGeneration &&
      state.session.spawnStatus === 'pending'
        ? {
            session: { ...state.session, spawnStatus: 'ready' as const },
            message: 'Free walk ready. Use WASD or the arrow keys to move.',
          }
        : state,
    ),
  rejectFreeWalk: (sessionGeneration, message) =>
    set((state) =>
      state.session?.kind === 'free' && state.session.generation === sessionGeneration
        ? {
            session: null,
            status: 'idle' as const,
            snapshot: empty,
            message,
            awaiting: false,
            recovering: false,
            resumeRequest: null,
          }
        : state,
    ),
  exit: () =>
    set(() => {
      resumeOperation++;
      return {
      recovering: false,
      session: null,
      status: 'idle',
      snapshot: empty,
      changed: false,
      message: null,
      awaiting: false,
      resumeRequest: null,
      pendingAcknowledgement: false,
      };
    }),
  toggle: () => {
    const state = get();
    if (!state.session) {
      return;
    }
    if (state.status === 'playing' || state.recovering) {
      state.takeManualControl();
      return;
    }
    state.resume();
  },
  takeManualControl: (message = 'Manual control active. Resume will calculate a new route from here.') => {
    const state = get();
    if (!state.session) {return;}
    resumeOperation++;
    state.session.runtime.speed = 0;
    set({
      status: 'paused',
      recovering: false,
      awaiting: false,
      resumeRequest: null,
      message: state.session.kind === 'route' ? message : state.message,
      snapshot: snapshotOf(state.session.runtime),
    });
  },
  resume: () => {
    const state = get();
    if (state.awaiting) {return;}
    if (!state.session || state.session.kind !== 'route' || !state.session.route || !state.session.destination) {
      set({
        status: state.session ? 'paused' : 'idle',
        awaiting: false,
        recovering: false,
        resumeRequest: null,
        message: 'Choose a destination before resuming auto-walk.',
      });
      return;
    }
    const id = ++resumeOperation;
    set({
      status: 'paused',
      awaiting: true,
      recovering: false,
      resumeRequest: { id, sessionGeneration: state.session.generation },
      message: 'Calculating a new route from your current position…',
    });
  },
  acceptResume: (id, route, document, request, navigationZones) => {
    const current = get();
    const { session } = current;
    if (
      !session ||
      session.kind !== 'route' ||
      current.resumeRequest?.id !== id ||
      current.resumeRequest.sessionGeneration !== session.generation
    ) {
      return;
    }
    try {
      const checked = routeResultSchema.parse(route);
      if (checked.option !== session.route?.option) {
        get().failResume(id, 'The requested route option is no longer available. Stay in free walk and try Resume again.');
        return;
      }
      const pinned = structuredClone(document);
      const pinnedZones = cloneNavigationZones(navigationZones ?? session.navigationZones);
      const nextRuntime = createFollower(compilePath(checked, pinned));
      const { runtime } = session;
      const position = [...runtime.position] as [number, number, number];
      if (
        nextRuntime.floorId !== runtime.floorId ||
        Math.hypot(nextRuntime.position[0] - position[0], nextRuntime.position[2] - position[2]) > 0.01
      ) {
        get().failResume(
          id,
          'The new route did not begin at your current position. Stay in free walk, return to a clear walkable zone, and try Resume again.',
        );
        return;
      }
      const { yaw, yawVelocity, gaitDistance, seekVersion, renderCommits } = runtime;
      Object.assign(runtime, nextRuntime);
      runtime.position = position;
      runtime.yaw = yaw;
      runtime.yawVelocity = yawVelocity;
      runtime.gaitDistance = gaitDistance;
      runtime.look = [
        position[0] - Math.sin(yaw),
        position[1] + 1.2,
        position[2] - Math.cos(yaw),
      ];
      runtime.seekVersion = seekVersion + 1;
      runtime.renderCommits = renderCommits;
      set({
        session: {
          ...session,
          route: checked,
          destination: structuredClone(request.dest),
          constraints: {
            accessibleOnly: request.accessibleOnly,
            allowRestricted: request.allowRestricted,
          },
          document: pinned,
          source: document,
          navigationZones: pinnedZones,
          runtime,
        },
        status: 'playing',
        recovering: false,
        awaiting: false,
        resumeRequest: null,
        liveKey: routeKey(checked),
        pendingAcknowledgement: false,
        snapshot: snapshotOf(runtime),
        changed: false,
        message: null,
      });
    } catch (error) {
      get().failResume(id, error instanceof Error ? error.message : 'Unable to resume auto-walk.');
    }
  },
  failResume: (id, message) => {
    if (get().resumeRequest?.id !== id) {return;}
    set({ recovering: false, awaiting: false, resumeRequest: null, status: 'paused', message });
  },
  seek: (progress) => {
    const state = get();
    if (!state.session?.route || !state.session.runtime.path.legs.length || !Number.isFinite(progress)) {
      return;
    }
    const value = Math.max(0, Math.min(1, progress));
    seekFollower(state.session.runtime, value);
    set({
      recovering: false,
      awaiting: false,
      message: state.recovering ? null : state.message,
      snapshot: snapshotOf(state.session.runtime),
      status: value === 1 ? 'arrived' : !state.recovering && state.status === 'playing' ? 'playing' : 'paused',
    });
  },
  setMode: (mode) => {
    const parsed = cameraModeSchema.safeParse(mode);
    if (parsed.success) {
      set({ mode: parsed.data });
    }
  },
  setSpeed: (speed) => {
    if ([0.5, 1, 2, 4].includes(speed)) {
      set({ speed });
    }
  },
  setComfort: (comfort) => set({ comfort }),
  publish: (runtime) =>
    set((state) => ({
      snapshot: snapshotOf(runtime),
      ...(state.session?.kind === 'route' && runtime.arrived && state.status === 'playing'
        ? { status: 'arrived' as const }
        : {}),
    })),
  markChanged: () => set({ changed: true, pendingAcknowledgement: false }),
  keep: (document, route, pending = false) =>
    set((state) => ({
      changed: false,
      message: null,
      liveKey: routeKey(route === undefined ? (state.session?.route ?? null) : route),
      pendingAcknowledgement: pending,
      session: state.session ? { ...state.session, source: document } : null,
    })),
  accept: (route, document) => {
    const current = get().session;
    if (!current || current.kind !== 'route') {
      return;
    }
    get().begin(route, document, current.initialFloor, current.destination ? {
      start: {
        floorId: current.runtime.floorId,
        kind: 'point',
        point: [current.runtime.position[0], current.runtime.position[2]],
      },
      dest: current.destination,
      ...current.constraints,
    } : undefined, current.navigationZones);
  },
  wait: () =>
    set({
      recovering: false,
      awaiting: true,
      status: 'paused',
      message: 'Updating route from your current position…',
    }),
  fail: (message) => set({ recovering: false, awaiting: false, resumeRequest: null, status: 'paused', message }),
}));
