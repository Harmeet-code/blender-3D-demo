import type { NormalizedLayout } from './normalize-layout.ts';
import type { RoutePoint } from './navigation.ts';
import type {
  BuildingRoute,
  NavigationRequest,
  NavigationResponse,
  NavigationRouteOptions,
} from './navigation-protocol.ts';
import { navigationLayoutKey } from './navigation-revision.ts';

export interface NavigationWorker {
  postMessage(message: NavigationRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<NavigationResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}
interface PendingRoute {
  revision: number;
  resolve: (route: BuildingRoute) => void;
  reject: (error: Error) => void;
  removeAbort?: () => void;
  cancelled?: () => void;
}
export interface NavigationQueryOptions extends NavigationRouteOptions {
  signal?: AbortSignal;
}
const cancelledError = () => new DOMException('Route calculation was cancelled.', 'AbortError');

export class NavigationClient {
  private worker: NavigationWorker | null = null;
  private layoutKey: string | null = null;
  private revision = 0;
  private sequence = 0;
  private pending = new Map<number, PendingRoute>();

  constructor(private readonly createWorker: () => NavigationWorker) {}

  query(
    layout: NormalizedLayout,
    fromFloor: string,
    from: RoutePoint,
    toFloor: string,
    to: RoutePoint,
    options: NavigationQueryOptions = {},
  ) {
    if (options.signal?.aborted) {
      return Promise.reject(cancelledError());
    }
    if (!this.worker) {
      this.worker = this.createWorker();
      this.worker.onmessage = ({ data }) => {
        const job = this.pending.get(data.id);
        if (!job) {
          return;
        }
        this.pending.delete(data.id);
        job.removeAbort?.();
        if (data.revision !== job.revision || data.revision !== this.revision) {
          if (job.cancelled) {
            job.cancelled();
          } else {
            job.resolve(null);
          }
        } else if ('error' in data) {
          job.reject(new Error(data.error));
        } else {
          job.resolve(data.route);
        }
      };
      this.worker.onerror = () =>
        this.dispose(new Error('Navigation worker failed; retry the route'));
    }
    const key = navigationLayoutKey(layout);
    if (this.layoutKey !== key) {
      this.cancel();
      this.layoutKey = key;
      this.revision++;
      this.worker.postMessage({ type: 'layout', revision: this.revision, layout });
    }
    const id = ++this.sequence;
    return new Promise<BuildingRoute>((resolve, reject) => {
      const { signal } = options;
      const abort = () => {
        const job = this.pending.get(id);
        if (!job) {
          return;
        }
        this.pending.delete(id);
        this.worker?.postMessage({ type: 'cancel', id });
        job.removeAbort?.();
        reject(cancelledError());
      };
      this.pending.set(id, {
        resolve,
        reject,
        revision: this.revision,
        ...(signal
          ? {
              removeAbort: () => signal.removeEventListener('abort', abort),
              cancelled: () => reject(cancelledError()),
            }
          : {}),
      });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      this.worker!.postMessage({
        type: 'route',
        id,
        revision: this.revision,
        fromFloor,
        from,
        toFloor,
        to,
        ...(options.enabledPortalTypes
          ? { enabledPortalTypes: [...options.enabledPortalTypes] }
          : {}),
      });
    });
  }

  cancel() {
    for (const [id, job] of this.pending) {
      this.worker?.postMessage({ type: 'cancel', id });
      job.removeAbort?.();
      if (job.cancelled) {
        job.cancelled();
      } else {
        job.resolve(null);
      }
    }
    this.pending.clear();
  }

  dispose(error?: Error) {
    for (const job of this.pending.values()) {
      job.removeAbort?.();
      if (error) {
        job.reject(error);
      } else {
        if (job.cancelled) {
          job.cancelled();
        } else {
          job.resolve(null);
        }
      }
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.layoutKey = null;
  }
}

export const navigationClient = new NavigationClient(
  () => new Worker(new URL('../workers/navigation.worker.ts', import.meta.url), { type: 'module' }),
);

export async function queryBuildingRouteAsync(
  ...args: Parameters<NavigationClient['query']>
): Promise<BuildingRoute> {
  if (typeof window === 'undefined' || typeof Bun !== 'undefined') {
    // Tests/server tools retain the proven algorithm. Browser work always uses the worker.
    const { queryBuildingRoute } = await import('./navigation.ts');
    const [layout, fromFloor, from, toFloor, to, options] = args;
    if (options?.signal?.aborted) {
      throw cancelledError();
    }
    const route = await queryBuildingRoute(layout, fromFloor, from, toFloor, to, options);
    if (options?.signal?.aborted) {
      throw cancelledError();
    }
    return route;
  }
  return navigationClient.query(...args);
}
