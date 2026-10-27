import { create } from 'zustand';
import { z } from 'zod';
import type { PlanDocument } from '../../model/types.ts';
import { routeResultSchema, type RouteResult } from '../model/route-schema.ts';
import { compilePath } from '../walkthrough/path.ts';
import { createFollower, seekFollower, type Follower } from '../walkthrough/follower.ts';

export const cameraModeSchema = z.enum(['overview', 'chase', 'first']);
export type CameraMode = z.infer<typeof cameraModeSchema>;
export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'arrived';
export interface PlaybackSession {
  route: RouteResult;
  document: PlanDocument;
  source: PlanDocument;
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
  begin: (route: RouteResult, document: PlanDocument, floorId: string) => void;
  exit: () => void;
  toggle: () => void;
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
export const routeKey = (route: RouteResult | null) =>
  route ? `${route.option}:${JSON.stringify(route.waypoints)}` : 'none';
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
  cameraAudit: null,
  begin: (route, document, floorId) => {
    try {
      const checked = routeResultSchema.parse(route),
        pinned = structuredClone(document),
        runtime = createFollower(compilePath(checked, pinned));
      set({
        session: {
          route: checked,
          document: pinned,
          source: document,
          runtime,
          initialFloor: floorId,
          generation: ++generation,
        },
        status: 'playing',
        mode: 'first',
        liveKey: routeKey(route),
        pendingAcknowledgement: false,
        snapshot: snapshotOf(runtime),
        changed: false,
        message: null,
        awaiting: false,
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
  exit: () =>
    set({
      session: null,
      status: 'idle',
      snapshot: empty,
      changed: false,
      message: null,
      awaiting: false,
      pendingAcknowledgement: false,
    }),
  toggle: () => {
    const state = get();
    if (!state.session) {
      return;
    }
    if (state.status === 'arrived') {
      seekFollower(state.session.runtime, 0);
    }
    set({
      status: state.status === 'playing' ? 'paused' : 'playing',
      message: null,
      snapshot: snapshotOf(state.session.runtime),
    });
  },
  seek: (progress) => {
    const state = get();
    if (!state.session || !Number.isFinite(progress)) {
      return;
    }
    const value = Math.max(0, Math.min(1, progress));
    seekFollower(state.session.runtime, value);
    set({
      snapshot: snapshotOf(state.session.runtime),
      status: value === 1 ? 'arrived' : state.status === 'playing' ? 'playing' : 'paused',
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
      ...(runtime.arrived && state.status === 'playing' ? { status: 'arrived' as const } : {}),
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
    if (!current) {
      return;
    }
    get().begin(route, document, current.initialFloor);
  },
  wait: () =>
    set({
      awaiting: true,
      status: 'paused',
      message: 'Updating route from your current position…',
    }),
  fail: (message) => set({ awaiting: false, status: 'paused', message }),
}));
