/* Only content-addressed, public images. Never intercept HTML, API state or mutable URLs. */
const CACHE = 'venue-floor-images-v1';
const LIMIT = 64 * 1024 * 1024;
const MAX_ENTRIES = 128;
let writes = Promise.resolve();
function allowed(url) {
  const value = new URL(url, self.location.href);
  return (
    value.origin === self.location.origin &&
    (/\/(?:floorplan\/)?asset-cache\/[a-f0-9]{64}\.(?:png|jpe?g|webp)$/.test(value.pathname) ||
      /^\/api\/media\/[a-f0-9]{64}\.(?:png|jpg|webp)$/.test(value.pathname) ||
      /^\/api\/media\/[a-f0-9]{64}\.tiles-[a-f0-9]{64}\/\d+\/\d+\/\d+\.webp$/.test(value.pathname))
  );
}
async function store(request, response) {
  if (
    response.status !== 200 ||
    request.headers.has('range') ||
    response.headers.has('content-range') ||
    response.type === 'opaque' ||
    /private|no-store/i.test(response.headers.get('cache-control') || '')
  ) {
    return;
  }
  const body = await response.clone().arrayBuffer();
  if (body.byteLength > LIMIT || !/^image\//i.test(response.headers.get('content-type') || '')) {
    return;
  }
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.set('content-length', String(body.byteLength));
  headers.set('x-venue-cache-bytes', String(body.byteLength));
  writes = writes
    .catch(() => {})
    .then(async () => {
      const cache = await caches.open(CACHE);
      // Delete/reinsert keeps CacheStorage insertion order as the LRU order.
      await cache.delete(request);
      await cache.put(request, new Response(body, { status: 200, headers }));
      const keys = await cache.keys();
      let bytes = 0;
      const sizes = [];
      for (const key of keys) {
        const entry = await cache.match(key);
        const size = Number(entry?.headers.get('x-venue-cache-bytes') || 0);
        sizes.push(size);
        bytes += size;
      }
      let count = keys.length;
      for (let i = 0; i < keys.length && (bytes > LIMIT || count > MAX_ENTRIES); i++) {
        await cache.delete(keys[i]);
        bytes -= sizes[i];
        count--;
      }
    });
  await writes;
}
async function image(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) {
    // Touch asynchronously under the same writer queue; a cache hit adds no network request.
    writes = writes
      .catch(() => {})
      .then(async () => {
        const current = await cache.match(request);
        if (current) {
          await cache.delete(request);
          await cache.put(request, current);
        }
      });
    return cached;
  }
  const response = await fetch(request);
  try {
    await store(request, response);
  } catch {
    /* Quota/disabled storage must not break rendering. */
  }
  return response;
}
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('venue-floor-images-') && name !== CACHE) {
          await caches.delete(name);
        }
      }
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener('fetch', (event) => {
  if (event.request.method === 'GET' && allowed(event.request.url)) {
    event.respondWith(image(event.request));
  }
});
self.addEventListener('message', (event) => {
  const port = event.ports[0];
  event.waitUntil(
    (async () => {
      try {
        if (event.data?.type === 'SAVE_IMAGES') {
          const urls = Array.isArray(event.data.urls)
            ? event.data.urls.filter((url) => typeof url === 'string' && allowed(url)).slice(0, 128)
            : [];
          let saved = 0;
          for (const url of urls) {
            const response = await image(new Request(url));
            if (response.ok && (await (await caches.open(CACHE)).match(url))) {
              saved++;
            }
          }
          port?.postMessage({ saved, requested: urls.length });
        } else if (event.data?.type === 'CLEAR_IMAGES') {
          await writes.catch(() => {});
          await caches.delete(CACHE);
          port?.postMessage({ cleared: true });
        }
      } catch (error) {
        port?.postMessage({ error: String(error) });
      }
    })(),
  );
});
