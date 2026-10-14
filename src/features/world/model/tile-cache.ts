import { Texture, SRGBColorSpace } from 'three';
import { assetAdmission } from './work-admission.ts';
import { fetchAssetBytes } from '@/features/assets/model/asset-response-cache.ts';
type Entry = {
  refs: number;
  at: number;
  bytes: number;
  texture?: Texture;
  promise: Promise<Texture>;
  abort: AbortController;
};
const cache = new Map<string, Entry>();
const BUDGET = 48 * 1024 * 1024;
function evict() {
  let bytes = [...cache.values()].reduce((sum, e) => sum + e.bytes, 0);
  for (const [url, entry] of [...cache].sort((a, b) => a[1].at - b[1].at)) {
    if (entry.refs || (bytes <= BUDGET && cache.size <= 64)) {
      continue;
    }
    entry.abort.abort();
    entry.texture?.dispose();
    entry.texture?.image?.close?.();
    bytes -= entry.bytes;
    cache.delete(url);
  }
}
export function retainTile(url: string) {
  let entry = cache.get(url);
  if (!entry) {
    const abort = new AbortController();
    entry = {
      refs: 0,
      at: performance.now(),
      bytes: 0,
      abort,
      promise: Promise.resolve(null as unknown as Texture),
    };
    const owned = entry;
    entry.promise = assetAdmission.run(async () => {
      const bytes = await fetchAssetBytes(url, { signal: abort.signal });
      const bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'flipY' });
      if (abort.signal.aborted) {
        bitmap.close();
        throw new DOMException('Aborted', 'AbortError');
      }
      const texture = new Texture(bitmap);
      texture.flipY = false;
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      owned.texture = texture;
      owned.bytes = (bitmap.width * bitmap.height * 4 * 4) / 3;
      evict();
      return texture;
    }, abort.signal);
    cache.set(url, entry);
  }
  entry.refs++;
  entry.at = performance.now();
  const owned = entry;
  return {
    promise: entry.promise,
    release: () => {
      owned.refs = Math.max(0, owned.refs - 1);
      owned.at = performance.now();
      if (!owned.refs && !owned.texture) {
        owned.abort.abort();
        cache.delete(url);
      }
      evict();
    },
  };
}
export function tileCacheSnapshot() {
  return {
    entries: cache.size,
    bytes: [...cache.values()].reduce((sum, e) => sum + e.bytes, 0),
    users: [...cache.values()].reduce((sum, e) => sum + e.refs, 0),
  };
}
export function releaseTiles() {
  for (const [url, entry] of cache) {
    if (!entry.refs) {
      entry.abort.abort();
      entry.texture?.dispose();
      entry.texture?.image?.close?.();
      cache.delete(url);
    }
  }
}
