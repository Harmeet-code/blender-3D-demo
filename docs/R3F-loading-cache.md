# Loading and cache implementation — 12 October 2026

The application now separates reusable download bytes from decoded scene ownership. It retains bounded warm response bytes and browser HTTP cache entries, while releasing scene geometries, materials, textures, compiled batches and tile GPU ownership after leaving the viewer. No native Blender geometry, material, lighting or booth dimensions were reduced by this pass.

## Cold-start work

- Tailwind scans `src` and `index.html` explicitly. Generated reports, browser traces, tests and Blender source no longer expand the product CSS scan. Earlier runs observed CSS HMR while test evidence was being written; this could disturb loading and active rendering.
- Vite ignores generated reports, test results, docs, Blender source and CodeGraph output for irrelevant watch updates. Actual `src` and `public` assets remain watched.
- The first dependency optimization pass explicitly includes lazy-route vendor packages, including Three, Fiber, Drei, Rapier and editor dependencies. These retain Vite's normal automatic dependency cache invalidation.
- Production continues to load route bundles lazily. No entire model catalog is preloaded.

## Cache identity and invalidation

`scripts/vite/asset-revisions.ts` fingerprints static GLBs and raster images with SHA-256. It publishes the lookup in entry HTML and emits immutable physical copies as `asset-cache/<SHA256>.<extension>` during the build. Dev middleware serves the same identities. Persisted layout URLs and native booth metadata stay unchanged; the network boundary resolves their current content identity. Catalog assets emitted by Vite also resolve to their corresponding fingerprinted copy.

Re-exporting a static file at the same source path changes its identity automatically. Dev watchers normalize Windows paths and debounce export events for 250 ms before refreshing fingerprints and reloading the app; production publishes new identities through a new build and revalidated entry HTML. Source bytes are checked against the scanned fingerprint before dev serving and build emission, preventing an export made during scanning from being served under the previous identity. Build-time changes fail the build explicitly and require a rerun.

Only same-origin identities present in the generated manifest and supported immutable media routes qualify for warm byte caching. Arbitrary external URLs, fake revision queries and arbitrary hash-looking filenames revalidate. Plain mutable URLs use conditional HTTP revalidation (`no-cache`), not stale cache-first behavior. Layout API responses are outside the asset byte cache; existing unsaved-layout protection and save/query invalidation remain responsible for document freshness.

Backend originals use exact upload-content SHA filenames. The coordinated server changes give preview bytes their own content hash and tiles a source-plus-recipe identity, including encoder/implementation changes. Legacy `.preview.webp` and `.tiles/...` paths are explicitly excluded from immutable byte classification and revalidate. The network boundary automatically appends `cache-policy=content-v2` to bypass previously shipped immutable legacy HTTP entries once, preserving other queries and fragments. Recipe tiles use `<sourceSha>.tiles-<recipeSha>/level/x/y.webp`.

## Ownership, limits and failure recovery

- Warm response LRU: at most 64 MiB and 256 entries. Oversized individual responses are not retained; failures and cancelled requests are not inserted. This is a CPU byte budget, separate from GPU/texture budgets.
- GLB network fetches carry an AbortSignal and use the shared two-job admission pool. Exiting before fetch completion cancels ownership and allows fresh re-entry. A noncancelable decoder finishing after exit disposes the orphan scene exactly once.
- Maps keep their existing bounded decoded-texture ownership; tiles retain the existing 48 MiB/64-entry GPU working set and bounded decode/upload queues. Byte reuse does not bypass those limits.
- Failed requests remain retryable through explicit error recovery. The root integration adds model/image Retry and Refresh app actions; these do not require deleting browser cache.
- Missing fingerprint files return an error with `no-store`, rather than successful SPA HTML under an asset URL. Production preview uses explicit middleware; Nginx uses `try_files ... =404`.
- Entry HTML revalidates, while immutable fingerprint files can be retained by HTTP caches. There is no service-worker interception or stale background replacement of an actively rendered model.

Publish entry HTML, JS, metadata and fingerprint files as one release. Retain prior hashed JS and fingerprint files for active clients during deployments; replacing the contents of an existing hash filename violates the content-addressed contract. If the host removes a prior release's files, the app reports failure with retry/refresh recovery. A cache cannot restore a file the host has removed. Rebuilding after production asset changes is part of publication, not manual cache maintenance. Dev asset reloads reset the running page; normal editor draft recovery still applies.

## Evidence and measured limits

All samples use the actual saved Luminary event, Chromium at 1280×900, and the GT 710 through D3D11. HTTP-disabled means Chrome's browser HTTP cache was disabled. Process-cold uses a new isolated Vite `cacheDir`, without deleting the application's existing cache. The measurement waits for canvas/floor UI, then owned model/map resources and an empty asset admission queue, followed by 350 ms. It does not establish shader-complete readiness, input p95, universal GPU performance, or a frame-rate guarantee. Dynamic tile selection can make request counts vary between samples.

| Condition | UI shell | Owned-asset readiness | Transferred bytes at snapshot |
| --- | ---: | ---: | ---: |
| Warm Vite process, HTTP disabled | 792 ms | 1,887 ms | 16,340,428 |
| Warm Vite process, final warm reload | 481 ms | 1,602 ms | 47,784 |
| Fresh isolated Vite process, HTTP disabled | 7,160 ms | 8,252 ms | See process-cold JSON |
| Fresh isolated process, subsequent warm reload | 519 ms | 1,633 ms | See process-cold JSON |
| Production preview, HTTP disabled | 497 ms | 1,716 ms | 1,955,309 |
| Production preview, final warm reload | 379 ms | 1,520 ms | 4,584 |

These are individual observations. The middle production warm run was slower: 1,449 ms shell and 1,855 ms owned-asset readiness. Do not advertise these numbers as percentiles or promise every warm load is faster. The original minute-long user screenshot was not reproduced in an isolated benchmark; cold dependency optimization and unrestricted source scanning were identified as additional development work to address. The warm-process before report has no comparable decoded-readiness gate, and its `firstModelMs` gate could include a GLB URL-import module; use its shell/network values only.

Passing evidence:

- `reports/performance/loading-cache-unit.log`: 7 tests / 32 assertions, including same-path re-export identity, changed-revision miss, external/mutable/legacy exclusions, failed-request retry, LRU budget and late decoder disposal.
- `reports/performance/loading-cache-e2e-clean.log`: 6 tests, 1.1 minutes, real D3D11. Warm route re-entry issues no second GLB network request while decoded ownership releases; HTTP identity/header checks pass. Existing native wide/close parity tolerances, useful failed-model shell, six original-mall views/lighting/graphics, and pending-fetch exit/re-entry also pass.
- `reports/performance/build-loading-cache.log`: production build passes; Vite reports 13.02 seconds. It emits 456 fingerprint copies / 35,102,701 bytes. These copies increase build storage; original source assets remain untouched.
- `reports/performance/startup-before.json`, `startup-after.json`, `startup-process-cold.json`, `startup-production.json`: condition-specific measurements.
- Missing production-preview fingerprint manually checked: HTTP 404 and `Cache-Control: no-store`.

Earlier `loading-cache-e2e.log` and `loading-cache-e2e-final.log` contain failed/interrupted attempts and are not passing evidence. The final legacy policy cutover and Windows watcher normalization were typechecked and statically reviewed after these browser measurements. Following the latest user request, further test-suite runs were stopped; final build integration, existing backend recipe/preview evidence, and host validation are recorded by the root in `R3F-execution.md`. Docker's daemon is unavailable on this machine, so Nginx configuration could not be exercised here. Integrated-GPU laptops and dense 1,000-booth overview FPS remain distinct qualification work; caching does not reduce their steady-state GPU geometry cost.

