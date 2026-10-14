import { create } from 'zustand';
interface AssetStatusState {
  statuses: Record<string, { kind: 'loading' | 'error'; message: string }>;
  failedUrls: string[];
  revision: number;
  setStatus: (id: string, status: AssetStatusState['statuses'][string] | null) => void;
  markFailedUrl: (url: string) => void;
  retry: () => void;
}
export const useAssetStatus = create<AssetStatusState>((set) => ({
  statuses: {},
  failedUrls: [],
  revision: 0,
  setStatus: (id, status) =>
    set((state) => {
      const previous = state.statuses[id];
      if (
        (!status && !previous) ||
        (status && previous?.kind === status.kind && previous.message === status.message)
      ) {
        return state;
      }
      const statuses = { ...state.statuses };
      if (status) {
        statuses[id] = status;
      } else {
        delete statuses[id];
      }
      return { statuses };
    }),
  markFailedUrl: (url) =>
    set((state) =>
      state.failedUrls.includes(url) ? state : { failedUrls: [...state.failedUrls, url] },
    ),
  retry: () => set((state) => ({ revision: state.revision + 1, statuses: {}, failedUrls: [] })),
}));
