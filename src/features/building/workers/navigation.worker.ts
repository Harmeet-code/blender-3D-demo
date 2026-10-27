import { clearNavigationCache, queryBuildingRoute } from '../model/navigation.ts';
import type { NormalizedLayout } from '../model/normalize-layout.ts';
import type { NavigationRequest, NavigationResponse } from '../model/navigation-protocol.ts';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<NavigationRequest>) => void) | null;
  postMessage: (message: NavigationResponse) => void;
};
let layout: NormalizedLayout | null = null;
let revision = 0;
let queue = Promise.resolve();
const cancelled = new Set<number>();
const pending = new Set<number>();
scope.onmessage = ({ data }) => {
  if (data.type === 'cancel') {
    if (pending.has(data.id)) {
      cancelled.add(data.id);
    }
    return;
  }
  if (data.type === 'route') {
    pending.add(data.id);
  }
  // Serialize WASM ownership; no overlapping builds or raw handles across threads.
  queue = queue.then(async () => {
    if (data.type === 'layout') {
      clearNavigationCache(data.layout);
      layout = data.layout;
      revision = data.revision;
      return;
    }
    if (cancelled.delete(data.id)) {
      pending.delete(data.id);
      return;
    }
    try {
      if (!layout || data.revision !== revision) {
        throw new Error('Navigation layout is stale');
      }
      const route = await queryBuildingRoute(
        layout,
        data.fromFloor,
        data.from,
        data.toFloor,
        data.to,
        {
          enabledPortalTypes: data.enabledPortalTypes,
          disabledPortals: data.disabledPortals,
          queryFilter: data.queryFilter,
          straight: data.straight,
          navAreas: data.navAreas,
        },
      );
      if (!cancelled.delete(data.id)) {
        scope.postMessage({ id: data.id, revision, route });
      }
    } catch (error) {
      if (!cancelled.delete(data.id)) {
        scope.postMessage({ id: data.id, revision: data.revision, error: String(error) });
      }
    } finally {
      pending.delete(data.id);
    }
  });
};
