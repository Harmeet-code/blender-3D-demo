declare global {
  var __ASSET_REVISIONS__: Record<string, string> | undefined;
}
/** A new URL bypasses previously shipped year-immutable legacy derived-media responses once. */
export function legacyMediaCacheUrl(
  url: string,
  base = typeof location === 'undefined' ? 'http://localhost/' : location.href,
) {
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  const parsed = new URL(url, base);
  if (!/^\/api\/media\/[a-f0-9]{64}(?:\.preview\.webp$|\.tiles\/)/.test(parsed.pathname)) {
    return url;
  }
  parsed.searchParams.set('cache-policy', 'content-v2');
  return url.startsWith('http') ? parsed.href : `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** Keep persisted layout URLs stable; resolve their content revision only at the network boundary. */
export function revisionedAssetUrl(
  url: string,
  revisions = globalThis.__ASSET_REVISIONS__,
  base = typeof location === 'undefined' ? 'http://localhost/' : location.href,
) {
  if (!revisions || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  const parsed = new URL(url, base),
    local = new URL(base);
  if (parsed.origin !== local.origin) {
    return url;
  }
  const path = parsed.pathname.replace(/^\/floorplan\//, '/');
  const builtName = path.match(/^\/assets\/(.+)-[\w-]{8,}(\.glb)$/);
  const revision =
    revisions[path] ??
    (builtName ? revisions[`/src/assets/models/${builtName[1]}${builtName[2]}`] : undefined);
  if (!revision) {
    return url;
  }
  const prefix = parsed.pathname.startsWith('/floorplan/') ? '/floorplan' : '';
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
  parsed.pathname = `${prefix}/asset-cache/${revision}${extension}`;
  parsed.search = '';
  return url.startsWith('http') ? parsed.href : `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
export function isImmutableAsset(
  url: string,
  revisions = globalThis.__ASSET_REVISIONS__,
  base = typeof location === 'undefined' ? 'http://localhost/' : location.href,
) {
  const parsed = new URL(url, base);
  if (parsed.origin !== new URL(base).origin) {
    return false;
  }
  const match = parsed.pathname.match(
    /\/(?:floorplan\/)?asset-cache\/([a-f0-9]{64})\.(?:glb|webp|png|jpe?g)$/,
  );
  return (
    (!!match && Object.values(revisions ?? {}).includes(match[1]!)) ||
    /^\/api\/media\/[a-f0-9]{64}\.(?:png|jpg|webp|glb)$/.test(parsed.pathname) ||
    /^\/api\/media\/[a-f0-9]{64}\.tiles-[a-f0-9]{64}\/\d{1,4}\/\d{1,4}\/\d{1,4}\.webp$/.test(
      parsed.pathname,
    )
  );
}
type Entry = { bytes: ArrayBuffer; at: number };
const entries = new Map<string, Entry>();
const BUDGET = 64 * 1024 * 1024;
let hits = 0,
  total = 0;
export function assetResponseCacheSnapshot() {
  return { entries: entries.size, bytes: total, hits, budget: BUDGET };
}
export function clearAssetResponseCache() {
  entries.clear();
  total = 0;
  hits = 0;
}
/** CPU response bytes survive route changes; GPU scenes remain independently reference-owned. */
export async function fetchAssetBytes(
  url: string,
  options: RequestInit = {},
): Promise<ArrayBuffer> {
  const key = revisionedAssetUrl(url),
    immutable = isImmutableAsset(key);
  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  const cached = immutable ? entries.get(key) : undefined;
  if (cached) {
    cached.at = performance.now();
    hits++;
    return cached.bytes;
  }
  const response = await fetch(key, { ...options, cache: immutable ? 'force-cache' : 'no-cache' });
  if (!response.ok) {
    throw new Error(`Asset request failed: HTTP ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  if (options.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  if (immutable && bytes.byteLength <= BUDGET) {
    const previous = entries.get(key);
    total += bytes.byteLength - (previous?.bytes.byteLength ?? 0);
    entries.set(key, { bytes, at: performance.now() });
    for (const [candidate, entry] of [...entries].sort((a, b) => a[1].at - b[1].at)) {
      if (total <= BUDGET && entries.size <= 256) {
        break;
      }
      total -= entry.bytes.byteLength;
      entries.delete(candidate);
    }
  }
  return bytes;
}
