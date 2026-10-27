import { create } from 'zustand';
import type { AvatarState, PortalType } from '@/features/building/model/building-schema.ts';
import { useLayoutStore } from '@/features/building/model/layout-store.ts';
import type { Logo } from '@/features/assets/model/branding.ts';
import { assetProofLayout } from '@/features/building/model/asset-proof-layout.ts';
import { assetStressLayout } from '@/features/building/model/asset-stress-layout.ts';
import {
  resolveNavigationDestination,
  floorPointDestination,
  type NavigationDestination,
} from '@/features/navigation/model/navigation-destinations.ts';
import {
  navigationClient,
  queryBuildingRouteAsync,
} from '@/features/building/model/navigation-client.ts';
import { avatarRuntime, type AvatarRoute, type MovementResolver } from './avatar-runtime.ts';
import { navigationLayoutKey } from '@/features/building/model/navigation-revision.ts';
import { manualLocomotion } from './manual-locomotion.ts';
import { isFloorPointClear } from '@/features/building/model/floor-point-clear.ts';
import {
  stepFreePreference,
  rememberDestination,
} from '@/features/navigation/model/wayfinding-preferences.ts';

const localAvatarId = crypto.randomUUID();
let routeRequest = 0;
let publishingPose = false;
let routeDestinationId: string | null = null;

interface WorldState {
  currentFloorId: string;
  dollhouse: boolean;
  walkMode: boolean;
  setWalkMode: (enabled: boolean) => void;
  publishRuntimePose: (animationState: AvatarState['animationState']) => void;
  assetProof: boolean;
  stressPreview: boolean;
  geometryFallback: boolean;
  showCeilings: boolean;
  showLabels: boolean;
  toggleLabels: () => void;
  galleryAssetId: string;
  diagnosticsEnabled: boolean;
  toggleDiagnostics: () => void;
  setGalleryAsset: (id: string) => void;
  previewDoorsOpen: boolean;
  togglePreviewDoors: () => void;
  toggleCeilings: () => void;
  logos: Record<string, Logo>;
  setLogo: (boothId: string, logo: Logo | null) => void;
  toggleStressPreview: () => void;
  toggleGeometryFallback: () => void;
  toggleAssetProof: () => void;
  selectedBoothId: string | null;
  cart: Record<string, string[]>;
  localAvatar: AvatarState;
  remoteAvatars: Map<string, AvatarState>;
  setCurrentFloor: (floorId: string) => void;
  toggleDollhouse: () => void;
  selectBooth: (boothId: string | null) => void;
  toggleAddOn: (boothId: string, addOnId: string) => void;
  moveLocalAvatar: (patch: Partial<AvatarState>) => void;
  upsertRemoteAvatar: (avatar: AvatarState) => void;
  removeRemoteAvatar: (avatarId: string) => void;
  clearRemoteAvatars: () => void;
  autopilot: AvatarRoute | null;
  routeStatus: 'idle' | 'computing' | 'walking' | 'blocked' | 'no-route' | 'error';
  routeError: string | null;
  teleportToRoom: (roomId: string) => boolean;
  teleportToDestination: (destinationId: string) => boolean;
  teleportToPoint: (floorId: string, point: [number, number]) => boolean;
  startAutopilotToPoint: (
    destination: NavigationDestination,
    options?: { enabledPortalTypes?: readonly PortalType[] },
  ) => Promise<boolean>;
  startAutopilot: (
    destinationId: string,
    options?: { enabledPortalTypes?: readonly PortalType[] },
  ) => Promise<boolean>;
  advanceAutopilot: (
    position: [number, number, number],
    step: number,
    resolve?: MovementResolver,
  ) => void;
  cancelAutopilot: () => void;
}

export const useWorldStore = create<WorldState>()((set, get) => ({
  currentFloorId: 'F1',
  dollhouse: false,
  walkMode: false,
  setWalkMode: (enabled) => set({ walkMode: enabled, ...(enabled ? { dollhouse: false } : {}) }),
  publishRuntimePose: (animationState) => {
    publishingPose = true;
    try {
      set({ localAvatar: { ...avatarRuntime.snapshot(get().localAvatar), animationState } });
    } finally {
      publishingPose = false;
    }
  },
  assetProof:
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('asset-preview'),
  stressPreview:
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('asset-stress'),
  geometryFallback: false,
  showCeilings: false,
  showLabels: false,
  toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
  galleryAssetId: 'chair',
  diagnosticsEnabled: false,
  toggleDiagnostics: () => set((state) => ({ diagnosticsEnabled: !state.diagnosticsEnabled })),
  setGalleryAsset: (galleryAssetId) => set({ galleryAssetId }),
  previewDoorsOpen: false,
  togglePreviewDoors: () => set((state) => ({ previewDoorsOpen: !state.previewDoorsOpen })),
  toggleCeilings: () => set((state) => ({ showCeilings: !state.showCeilings })),
  logos: {},
  setLogo: (boothId, logo) =>
    set((state) => {
      const logos = { ...state.logos };
      if (logo) {
        logos[boothId] = logo;
      } else {
        delete logos[boothId];
      }
      return { logos };
    }),
  toggleStressPreview: () => set((state) => ({ stressPreview: !state.stressPreview })),
  toggleGeometryFallback: () => set((state) => ({ geometryFallback: !state.geometryFallback })),
  toggleAssetProof: () => set((state) => ({ assetProof: !state.assetProof })),
  selectedBoothId: null,
  cart: {},
  localAvatar: {
    id: localAvatarId,
    position: [0, 1.2, 6],
    rotationY: 0,
    floorId: 'F1',
    animationState: 'idle',
  },
  remoteAvatars: new Map(),
  setCurrentFloor: (floorId) => {
    const state = get();
    const layout = state.stressPreview
      ? assetStressLayout
      : state.assetProof
        ? assetProofLayout
        : useLayoutStore.getState().layout;
    const floor = layout.floors.find((f) => f.id === floorId);
    if (!floor) {
      return;
    }
    const start: [number, number] = floor.authoring?.spawn ?? [0, 6];
    if (!isFloorPointClear(layout, floorId, start)) {
      set({
        routeError:
          'The avatar start on this floor is obstructed. Move it to a clear place in the builder.',
        routeStatus: 'blocked',
      });
      return;
    }
    manualLocomotion.reset();
    avatarRuntime.manualMoving = false;
    routeRequest++;
    routeDestinationId = null;
    navigationClient.cancel();
    set((state) => ({
      currentFloorId: floorId,
      autopilot: null,
      routeStatus: 'idle',
      routeError: null,
      localAvatar: {
        ...state.localAvatar,
        floorId,
        position: [start[0], floor.heightOffset + 1.2, start[1]],
      },
    }));
  },
  toggleDollhouse: () => {
    set((state) => ({ dollhouse: !state.dollhouse, walkMode: false }));
  },
  selectBooth: (boothId) => {
    set({ selectedBoothId: boothId });
  },
  toggleAddOn: (boothId, addOnId) => {
    set((state) => {
      const current = state.cart[boothId] ?? [];
      const next = current.includes(addOnId)
        ? current.filter((id) => id !== addOnId)
        : [...current, addOnId];
      return { cart: { ...state.cart, [boothId]: next } };
    });
  },
  moveLocalAvatar: (patch) => {
    if (patch.position || patch.floorId) {
      routeRequest++;
      navigationClient.cancel();
    }
    set((state) => ({ localAvatar: { ...state.localAvatar, ...patch } }));
  },
  upsertRemoteAvatar: (avatar) => {
    set((state) => {
      const previous = state.remoteAvatars.get(avatar.id);
      if (
        previous &&
        previous.floorId === avatar.floorId &&
        previous.rotationY === avatar.rotationY &&
        previous.animationState === avatar.animationState &&
        previous.position.every((n, i) => n === avatar.position[i])
      ) {
        return state;
      }
      const next = new Map(state.remoteAvatars);
      next.set(avatar.id, avatar);
      return { remoteAvatars: next };
    });
  },
  removeRemoteAvatar: (avatarId) => {
    set((state) => {
      if (!state.remoteAvatars.has(avatarId)) {
        return state;
      }
      const next = new Map(state.remoteAvatars);
      next.delete(avatarId);
      return { remoteAvatars: next };
    });
  },
  clearRemoteAvatars: () => {
    set((state) => (state.remoteAvatars.size === 0 ? state : { remoteAvatars: new Map() }));
  },
  autopilot: null,
  routeStatus: 'idle',
  routeError: null,
  teleportToRoom: (roomId) => get().teleportToDestination(roomId),
  teleportToPoint: (floorId, point) => {
    const state = get();
    const layout = state.stressPreview
      ? assetStressLayout
      : state.assetProof
        ? assetProofLayout
        : useLayoutStore.getState().layout;
    const destination = floorPointDestination(layout, floorId, point);
    if (!destination || !isFloorPointClear(layout, floorId, point)) {
      set({ routeError: 'Choose a clear, walkable point on the floor.' });
      return false;
    }
    get().cancelAutopilot();
    manualLocomotion.reset();
    avatarRuntime.manualMoving = false;
    set({
      currentFloorId: floorId,
      dollhouse: false,
      localAvatar: {
        ...get().localAvatar,
        floorId,
        position: [...destination.position],
        animationState: 'idle',
      },
    });
    return true;
  },
  teleportToDestination: (destinationId) => {
    routeRequest++;
    routeDestinationId = null;
    navigationClient.cancel();
    const state = get();
    const layout = state.stressPreview
      ? assetStressLayout
      : state.assetProof
        ? assetProofLayout
        : useLayoutStore.getState().layout;
    const target = resolveNavigationDestination(layout, destinationId);
    if (!target) {
      return false;
    }
    if (!isFloorPointClear(layout, target.floorId, [target.position[0], target.position[2]])) {
      get().cancelAutopilot();
      set({
        routeStatus: 'blocked',
        routeError: 'This destination is obstructed. Choose a clear place on the floor.',
      });
      return false;
    }
    manualLocomotion.reset();
    avatarRuntime.manualMoving = false;
    set({
      currentFloorId: target.floorId,
      dollhouse: false,
      autopilot: null,
      routeStatus: 'idle',
      routeError: null,
      localAvatar: {
        ...state.localAvatar,
        floorId: target.floorId,
        animationState: 'idle',
        position: [...target.position],
      },
    });
    return true;
  },
  startAutopilot: (destinationId, options) => {
    const state = get();
    const layout = state.stressPreview
      ? assetStressLayout
      : state.assetProof
        ? assetProofLayout
        : useLayoutStore.getState().layout;
    const target = resolveNavigationDestination(layout, destinationId);
    if (!target) {
      get().cancelAutopilot();
      set({ routeStatus: 'error', routeError: 'This destination is no longer available.' });
      return Promise.resolve(false);
    }
    return get().startAutopilotToPoint(target, options);
  },
  startAutopilotToPoint: async (target, options) => {
    manualLocomotion.reset();
    avatarRuntime.manualMoving = false;
    const request = ++routeRequest;
    const destinationId = target.id;
    routeDestinationId = destinationId;
    const state = get();
    const layout = state.stressPreview
      ? assetStressLayout
      : state.assetProof
        ? assetProofLayout
        : useLayoutStore.getState().layout;
    options ??= stepFreePreference(layout) ? { enabledPortalTypes: ['elevator'] } : undefined;
    if (!isFloorPointClear(layout, target.floorId, [target.position[0], target.position[2]])) {
      routeDestinationId = null;
      navigationClient.cancel();
      set({
        autopilot: null,
        routeStatus: 'error',
        routeError: 'This destination is no longer available.',
        localAvatar: { ...avatarRuntime.snapshot(state.localAvatar), animationState: 'idle' },
      });
      return false;
    }
    navigationClient.cancel();
    set({
      autopilot: null,
      dollhouse: false,
      localAvatar: { ...avatarRuntime.snapshot(get().localAvatar), animationState: 'idle' },
      routeStatus: 'computing',
      routeError: null,
    });
    const origin: [number, number, number] = [...avatarRuntime.position];
    const destination: [number, number, number] = [...target.position];
    let route;
    try {
      route = await queryBuildingRouteAsync(
        layout,
        state.currentFloorId,
        origin,
        target.floorId,
        destination,
        options,
      );
    } catch (error) {
      if (request === routeRequest) {
        routeDestinationId = null;
        set({
          routeStatus: 'error',
          routeError: error instanceof Error ? error.message : String(error),
        });
      }
      return false;
    }
    if (request !== routeRequest) {
      return false;
    }
    if (!route) {
      routeDestinationId = null;
      set({ routeStatus: 'no-route', routeError: `No walkable route to ${target.label}.` });
      return false;
    }
    set({
      autopilot: { destinationId, waypoints: route.points, floors: route.floors },
      routeStatus: 'walking',
      localAvatar: { ...get().localAvatar, animationState: 'walk' },
    });
    rememberDestination(layout, destinationId);
    return true;
  },
  advanceAutopilot: (_position, step, resolve) => {
    const { autopilot } = get();
    if (!autopilot) {
      return;
    }
    avatarRuntime.advance(step, resolve);
    const { arrived } = avatarRuntime;
    const blocked = avatarRuntime.blockedSeconds >= 0.5;
    if (arrived || blocked) {
      routeDestinationId = null;
    }
    avatarRuntime.snapshotSeconds += step / 3;
    const changedFloor = avatarRuntime.floorId !== get().currentFloorId;
    if (!arrived && !blocked && !changedFloor && resolve && avatarRuntime.snapshotSeconds < 0.1) {
      return;
    }
    avatarRuntime.snapshotSeconds = 0;
    const snapshot = avatarRuntime.snapshot(get().localAvatar);
    if (blocked) {
      snapshot.animationState = 'idle';
    }
    publishingPose = true;
    try {
      set({
        currentFloorId: avatarRuntime.floorId,
        localAvatar: snapshot,
        ...(arrived || blocked
          ? {
              autopilot: null,
              routeStatus: blocked ? ('blocked' as const) : ('idle' as const),
              routeError: blocked
                ? 'The route is blocked. Try a new route after checking the layout.'
                : null,
            }
          : {}),
      });
    } finally {
      publishingPose = false;
    }
  },
  cancelAutopilot: () => {
    routeRequest++;
    routeDestinationId = null;
    navigationClient.cancel();
    const snapshot = avatarRuntime.snapshot(get().localAvatar);
    snapshot.animationState = 'idle';
    set({ autopilot: null, localAvatar: snapshot, routeStatus: 'idle', routeError: null });
  },
}));

avatarRuntime.synchronize(useWorldStore.getState().localAvatar);
const unsubscribeWorld = useWorldStore.subscribe((state, previous) => {
  if (state.localAvatar !== previous.localAvatar && !publishingPose) {
    avatarRuntime.synchronize(state.localAvatar);
  }
  if (state.autopilot !== previous.autopilot) {
    avatarRuntime.setRoute(state.autopilot);
  }
  if (state.currentFloorId !== previous.currentFloorId && !publishingPose) {
    routeRequest++;
    navigationClient.cancel();
  }
});
const unsubscribeLayout = useLayoutStore.subscribe((state, previous) => {
  const oldTarget = routeDestinationId
    ? resolveNavigationDestination(previous.layout, routeDestinationId)
    : undefined;
  const newTarget = routeDestinationId
    ? resolveNavigationDestination(state.layout, routeDestinationId)
    : undefined;
  // Destination edits cancel stale routes without rebuilding unchanged navigation meshes.
  const changedDestination =
    !!routeDestinationId &&
    (!oldTarget ||
      !newTarget ||
      oldTarget.floorId !== newTarget.floorId ||
      oldTarget.position.some((coordinate, axis) => coordinate !== newTarget.position[axis]));
  if (
    state.layout !== previous.layout &&
    (changedDestination ||
      navigationLayoutKey(state.layout) !== navigationLayoutKey(previous.layout))
  ) {
    useWorldStore.getState().cancelAutopilot();
  }
});
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeWorld();
    unsubscribeLayout();
    navigationClient.dispose();
  });
}
