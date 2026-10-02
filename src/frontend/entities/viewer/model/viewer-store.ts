import { create } from 'zustand';
import type { AvatarState } from '../../building/model/building-schema.ts';
import { useLayoutStore } from '../../building/model/layout-store.ts';
import type { Logo } from '../../asset/model/branding.ts';
import { assetProofLayout } from '../../building/model/asset-proof-layout.ts';
import { assetStressLayout } from '../../building/model/asset-stress-layout.ts';

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
}

export const useWorldStore = create<WorldState>((set) => ({
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
}));
