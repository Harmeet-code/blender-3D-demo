import { create } from 'zustand';
import type { AvatarState } from '../../building/model/building-schema.ts';

interface WorldState {
  currentFloorId: string;
  dollhouse: boolean;
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
}

export const useWorldStore = create<WorldState>((set) => ({
  currentFloorId: 'F1',
  dollhouse: false,
  selectedBoothId: null,
  cart: {},
  localAvatar: {
    id: 'local',
    position: [0, 0, 0],
    rotationY: 0,
    floorId: 'F1',
    animationState: 'idle',
  },
  remoteAvatars: new Map(),
  setCurrentFloor: (floorId) => {
    set((state) => ({
      currentFloorId: floorId,
      localAvatar: { ...state.localAvatar, floorId },
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
}));
