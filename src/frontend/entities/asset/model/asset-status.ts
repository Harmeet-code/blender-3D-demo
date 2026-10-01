import { create } from 'zustand';
interface AssetStatusState {
  statuses: Record<string, { kind: 'loading' | 'error'; message: string }>;
  revision: number;
  setStatus: (id: string, status: AssetStatusState['statuses'][string] | null) => void;
  retry: () => void;
}
export const useAssetStatus = create<AssetStatusState>((set) => ({
  statuses: {},
  revision: 0,
  setStatus: (id, status) =>
    set((state) => {
      const statuses = { ...state.statuses };
      if (status) {
        statuses[id] = status;
      } else {
        delete statuses[id];
      }
      return { statuses };
    }),
  retry: () => set((state) => ({ revision: state.revision + 1, statuses: {} })),
}));
