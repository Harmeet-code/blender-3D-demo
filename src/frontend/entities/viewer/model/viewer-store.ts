import { create } from 'zustand';
import type { AvatarState } from '../../building/model/building-schema.ts';
import { useLayoutStore } from '../../building/model/layout-store.ts';
import type { Logo } from '../../asset/model/branding.ts';
import { assetProofLayout } from '../../building/model/asset-proof-layout.ts';
import { assetStressLayout } from '../../building/model/asset-stress-layout.ts';
import { roomEntrance } from '../../building/model/room-assembly.ts';
import { queryFloorRoute } from '../../building/model/navigation.ts';

interface WorldState {
  currentFloorId: string;
  dollhouse: boolean;
  assetProof: boolean;
  lowQuality: boolean;
  stressPreview: boolean;
  geometryFallback: boolean;
  showCeilings: boolean;
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
  toggleQuality: () => void;
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
  autopilot: { destinationId: string; waypoints: Array<[number, number, number]> } | null;
  teleportToRoom: (roomId: string) => boolean;
  startAutopilot: (roomId: string) => Promise<boolean>;
  advanceAutopilot: (position: [number, number, number], step: number) => void;
  cancelAutopilot: () => void;
}

export const useWorldStore = create<WorldState>()((set, get) => ({
  currentFloorId: 'F1',
  dollhouse: false,
  assetProof:
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('asset-preview'),
  lowQuality:
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('quality') === 'low',
  stressPreview:
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('asset-stress'),
  geometryFallback: false,
  showCeilings: false,
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
  toggleQuality: () => set((state) => ({ lowQuality: !state.lowQuality })),
  selectedBoothId: null,
  cart: {},
  localAvatar: {
    id: 'local',
    position: [0, 1.2, 6],
    rotationY: 0,
    floorId: 'F1',
    animationState: 'idle',
  },
  remoteAvatars: new Map(),
  setCurrentFloor: (floorId) => {
    set((state) => ({
      currentFloorId: floorId,
      localAvatar: {
        ...state.localAvatar,
        floorId,
        position: [
          0,
          ((state.stressPreview
            ? assetStressLayout
            : state.assetProof
              ? assetProofLayout
              : useLayoutStore.getState().layout
          ).floors.find((floor) => floor.id === floorId)?.heightOffset ?? 0) + 1.2,
          6,
        ],
      },
    }));
  },
  toggleDollhouse: () => {
    set((state) => ({ dollhouse: !state.dollhouse }));
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
    set((state) => ({ localAvatar: { ...state.localAvatar, ...patch } }));
  },
  upsertRemoteAvatar: (avatar) => {
    set((state) => {
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
  teleportToRoom: (roomId) => {
    const state = get();
    const layout = state.stressPreview
      ? assetStressLayout
      : state.assetProof
        ? assetProofLayout
        : useLayoutStore.getState().layout;
    const room = layout.rooms.find((candidate) => candidate.id === roomId);
    if (!room) {
      return false;
    }
    const entrance = room.entrance?.position ?? roomEntrance(room).position;
    const height = layout.floors.find((floor) => floor.id === room.floorId)?.heightOffset ?? 0;
    set({
      currentFloorId: room.floorId,
      autopilot: null,
      localAvatar: {
        ...state.localAvatar,
        floorId: room.floorId,
        animationState: 'idle',
        position: [entrance[0], height + 1.2, entrance[1]],
      },
    });
    return true;
  },
  startAutopilot: async (roomId) => {
    const state = get();
    const layout = state.stressPreview
      ? assetStressLayout
      : state.assetProof
        ? assetProofLayout
        : useLayoutStore.getState().layout;
    const room = layout.rooms.find((candidate) => candidate.id === roomId);
    if (!room) {
      return false;
    }
    const entrance = room.entrance?.position ?? roomEntrance(room).position;
    if (room.floorId !== state.currentFloorId) {
      state.setCurrentFloor(room.floorId);
    }
    const origin = get().localAvatar.position;
    const height = layout.floors.find((floor) => floor.id === room.floorId)?.heightOffset ?? 0;
    const destination: [number, number, number] = [entrance[0], height + 1.2, entrance[1]];
    const route = await queryFloorRoute(layout, room.floorId, origin, destination);
    if (!route.ok) {
      return false;
    }
    set({
      autopilot: { destinationId: roomId, waypoints: route.points },
      localAvatar: { ...get().localAvatar, animationState: 'walk' },
    });
    return true;
  },
  advanceAutopilot: (position, step) => {
    const autopilot = get().autopilot;
    if (!autopilot) {
      return;
    }
    const remaining = autopilot.waypoints.slice();
    while (remaining.length > 0) {
      const next = remaining[0];
      if (!next) {
        break;
      }
      const distance = Math.hypot(next[0] - position[0], next[2] - position[2]);
      if (distance <= step) {
        position = next;
        remaining.shift();
        continue;
      }
      const ratio = step / distance;
      position = [
        position[0] + (next[0] - position[0]) * ratio,
        next[1],
        position[2] + (next[2] - position[2]) * ratio,
      ];
      break;
    }
    if (remaining.length === 0) {
      set((state) => ({
        autopilot: null,
        localAvatar: { ...state.localAvatar, animationState: 'idle', position },
      }));
      return;
    }
    set((state) => ({
      autopilot: { ...autopilot, waypoints: remaining },
      localAvatar: { ...state.localAvatar, animationState: 'walk', position },
    }));
  },
  cancelAutopilot: () => {
    set((state) =>
      state.autopilot
        ? {
            autopilot: null,
            localAvatar: { ...state.localAvatar, animationState: 'idle' },
          }
        : state,
    );
  },
}));
