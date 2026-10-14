# R3F execution status

Date: 12 October 2026. Status: stages A–E and the page-load/cache implementation are integrated; optional stage F evaluated and not adopted. Final TypeScript/production build passed. Further stage G test-suite runs were stopped at the user's explicit request to prioritize delivery. Hardware acceptance remains conditional on the workload and device.

This document supersedes Friday's first-delivery status. It records implemented behavior separately from unqualified performance targets. Native Blender geometry, materials, lighting palettes and physical booth dimensions remain the reference.

## Implementation and stage gates

| Stage | Implemented behavior and evidence | Remaining gate |
| --- | --- | --- |
| A: Physical and measurement contracts | One physical provider supplies native/catalog/procedural geometry, entrances, colliders and navigation. All eight exact feet presets, SW13 = 9.144 m, custom/fractional/rotated and concave polygon cases are covered. Inward polygon wall envelopes prevent acute-corner protrusions. Controlled native close/wide comparisons, CPU submission, asynchronous GPU queries and trace recording are available. | First-usable-view and input latency qualification on named devices; automated command timing currently includes Playwright overhead. |
| B: Movement and authoring | Mutable avatar pose/route cursor; fixed 1/60 s collision-corrected stepping at 3 m/s; stable path buffer; bounded UI snapshots. Camera commands animate and cancel on input, with reduced-motion support. Editor drafts commit at drag end, support meter snapping, undo/redo and explicit local recovery. Dirty/revision guards prevent background fetches and late uploads from replacing newer edits. | Full final browser recheck deferred at the user's request. |
| C: Scheduling and workers | A demand-render coordinator owns wake leases and fixed-step simulation. Physics, controls, walking, doors, floor transitions, remote updates and context recovery wake and settle correctly. Navigation runs in a module worker with revision/cancellation guards and errors. Asset, shader and tile jobs have bounded admission; shader preparation is coalesced; texture uploads drain two per frame. Deferred cell rebucketing keeps the demand loop awake until settled. | New cache cancellation and late decoder disposal passed focused checks. The complete idle/context matrix was not repeated after the final cache edits. |
| D: Full-detail sharing | Original native booth primitives are transformed and grouped only when material and geometry attribute/index signatures match. Cell instancing retains original geometry/materials; transparent/transmission and arbitrary authored hierarchies retain independent rendering where required. Spatial picking narrows candidates using cached transforms. Native load failures show a measured shell and an error. | Dense 1,000-booth views are still GPU limited on the GT 710. Batching does not establish a universal 60 FPS guarantee. |
| E: Images, lighting and labels | Uploaded originals are retained; bounded previews and content-addressed high-resolution tiles are generated. Static F1/F2 pyramids contain 418/17 tiles. Visible tiles use bounded decoding, uploads and an LRU, with a valid parent underneath. Floor visibility follows the actual animated world matrix. Dirty shadows, a bounded ID atlas, preserved independent logos and efficient/balanced/maximum graphics tiers are integrated into the main app and original-mall page. | Warm-byte budgets, invalidation and unchanged native views passed focused checks. Final recovery UI and backend integration build successfully; full final browser matrix deferred. |
| F: Optional LOD/compression | Conservative simplification with locked boundaries, UVs and normals yielded zero triangle savings across all eight booth models. It was not adopted. Only the experiment report remains; temporary candidate outputs were removed after verifying their exact paths. | No LOD implementation is required when it fails the value/appearance gate. Future distant-detail work requires separate visual evidence. |
| G: Regression and release evidence | Unit/integration suite, actual authoring/upload/save/reload/export, worker routes, obstruction, floor transfer, multiplayer, context restoration, native visual parity, original mall presets and 20-cycle lifecycle checks have run. Production worker executes under `/floorplan/`. | Final production authoring rerun and complete regression rerun deferred after the user explicitly stopped test work. Integrated-GPU hardware qualification remains open. |

The wall and navigation contracts use actual opening geometry, not a visual-only substitute. Cart preview furniture is collision-tested at runtime; do not interpret the current worker evidence as a guarantee that every transient cart preview is baked into a new navigation mesh.

## Verified checkpoint before the page-load/cache pass

| Check | Result and evidence |
| --- | --- |
| Full verification | 138 passing tests, 2,422 assertions across 35 files; type checking, lint and formatting passed. `reports/performance/verify-monday-final.log`. |
| Native asset validation | 19 exports validated. `reports/performance/assets-monday-final.log`. |
| Production build | Passed with emitted module worker. Existing large-chunk warnings remain. `reports/performance/build-monday-final.log`. |
| Development browser matrix | 15 tests passed in a clean serial run, 2.6 minutes. `reports/performance/e2e-monday-clean.log`. |
| Polygon contract | Acute, concave, thin and both-winding fixtures passed without relaxing the dimension tolerance. `reports/performance/polygon-contract-after.log`. |
| Idle behavior | Three repeated tests passed: no continuous physics and at most two canvas repaints during the 700 ms settled observation. `reports/performance/idle-monday-v1.log`. |
| Floor transfer and labels | Actual elevator transfer, door/floor transitions and labels passed. `reports/performance/portal-monday-v1.log`. |
| Production browser checkpoint | Emitted worker test passed. Production authoring reached the saved JSON assertion and failed because a label matched both the textarea and a hidden panel; the test now selects the exact textbox. A final rerun is pending. `reports/performance/production-monday-v1.log`. |
| 20-cycle lifetime | No owned cache references remained on viewer exit in the pre-warm-cache implementation. Warm JavaScript heap versus the last five cycles grew approximately 3.9 MiB, below the 12 MiB gate. `reports/performance/lifecycle-20-cycles.json`. This is not a portable VRAM measurement. |
| Native appearance | Wide and close batched-versus-original comparisons passed: mean channel error below 1.5/255 and fewer than 1% of pixels differing by over 12. `reports/performance/native-{reference,batched}-{wide,close}.png`. This checks the runtime models, not Blender Cycles parity. |

These are checkpoint results, not claims that unverified subsequent edits passed. The latest abortable-fetch loader typechecked in `typecheck-admission-final.log`; its browser behavior and the new cache policy are being verified in the page-load pass.

Earlier failed captures and tests are retained for diagnosis. The early baseline rendered the demo fallback with a failed backend and is invalid for comparison. Concurrent browser/build work caused harness contention in earlier Monday runs; the clean 15-test result ran alone. Browser suites and benchmarks must run serially, without source hot-reloads during capture.

## Hardware and performance envelope

The default automated Chromium renderer was SwiftShader. Explicit ANGLE D3D11 exposes the actual NVIDIA GeForce GT 710, 2 GB; `reports/performance/gpu-probe.json` records both. A software renderer is useful for correctness but cannot qualify integrated-GPU speed.

At 1280 × 900, DPR 1, unchanged native booth geometry/materials and a fixed scenario:

| Workload | Evidence |
| --- | --- |
| 200 native booths, original hierarchy | About 10,241–10,242 draws; 47.5–53.6 FPS, p95 frames 22–29 ms. `native-reference-final.json`. |
| 200 native booths, cell batching | About 662 draws with all 969,946 triangles retained. Across captures, roughly 56–60 FPS and p95 frames 17.7–22.2 ms. GPU query p95 approximately 15.6–16.4 ms. `native-final.json`, `native-candidate-final.json`, `native-profile.json`. |
| 1,000 native booths, full detail | 4,847,002 triangles; approximately 17.7 FPS, p95 frames 62–64 ms in the final capture. GPU query p95 approximately 57.6–61.2 ms in profiling. `native-final.json`, `native-profile.json`. |
| Larger 256 m cells at 1,000 booths | Draws fell to about 398, but FPS remained about 17.5. `native-cell256.json`. The bottleneck is not solved by fewer draws alone. |

Draw submission fell about 93.5% in the matched 200-booth comparison. This is not a 93.5% FPS improvement. GPU timings use nonblocking disjoint timer queries and relatively few samples; active RAF timings and CPU submission are reported separately. CPU submission on an overloaded GPU can include driver backpressure. Benchmark settling was fixed at 15 seconds, so these reports do not measure first usable page load. Automated input bounds include browser automation overhead and do not prove the proposed 50 ms target.

The graphics tiers vary resolution and shadow allocation, while retaining the assets, PBR materials, exposure and lighting. Integrated laptops and a high-end maximum tier need their own qualification. The app cannot promise unrestricted dense scenes at unchanged pixel cost on every lightweight machine.

## Page-load and cache delivery

The user reported slow page loading and explicitly requested a subagent on 12 October. Their Network screenshot has Disable cache enabled, so cold and warm measurements must be separate. Cold load must improve independently of cache hits.

The dedicated subagent implemented static SHA-256 fingerprint files, a bounded 64 MiB/256-entry warm response LRU, abortable fetches and late-decoder cleanup. GPU scene resources still release independently. Static files resolve to `asset-cache/<SHA256>.<extension>` in dev and production while logical saved-layout URLs remain unchanged. Windows export watching normalizes paths and debounces fingerprint refresh. Entry HTML revalidates; positive fingerprint responses are immutable and missing revisions return explicit uncached errors.

The concrete cold-start problem was unrestricted Tailwind source scanning: generated reports, traces and Blender sources contributed to CSS scanning and unwanted HMR. Tailwind now scans product `src` and the entry page only. Vite excludes unrelated generated files from watching and prebundles the lazy routes' vendor dependencies on its first optimization pass.

Root integration also closes the backend derived-media gap. Preview URLs hash their actual encoded bytes. Tile URLs include source and processing fingerprints; the latter changes with the implementation or encoder versions. Historical generated tiles remain intact, and unavailable historical revisions cannot be regenerated with different bytes under the old identity. Legacy preview/tile URLs revalidate and automatically receive a one-time `cache-policy=content-v2` query to bypass previously shipped immutable HTTP entries. Original uploads and existing saved-layout URLs remain preserved.

Failed models and floor images now expose Retry and Refresh app controls; an image failure no longer silently removes the map. Nginx configuration adds gzip for JS/CSS/JSON/WASM, revalidated entry HTML, immutable successful hash responses and `no-store` for missing deploy artifacts. Docker's daemon is unavailable, so Nginx host execution was not validated locally.

| Final evidence | Result |
| --- | --- |
| `loading-cache-unit.log` | 7 passing focused tests / 32 assertions: revision identity, warm reuse, legacy policy cutover, external/mutable exclusions, failed-response retry, LRU and orphan decoder disposal. |
| `loading-cache-e2e-clean.log` | 6 passing browser cases on GT 710 D3D11: warm byte reuse while scene resources release, fingerprint response headers, native close/wide parity, native failure, six mall presets/lighting/graphics, and pending-fetch cancellation/re-entry. |
| `media-cache-final.log` | 3 backend tests / 35 assertions, including true preview content identity, stable repeated uploads, recipe changes, legacy readability/revalidation and preserved historical tiles. |
| `format-loading-final.log`, `build-loading-final.log` | Final formatting and TypeScript/production build passed after integration; Vite build 11.63 s. Large Three/Rapier chunk warnings remain. |

Actual saved Luminary samples at 1280 × 900 on GT 710 D3D11:

| Condition | Shell | Owned model/map resources and asset admission settled | Transfer |
| --- | ---: | ---: | ---: |
| Running Vite process, HTTP disabled | 792 ms | 1,887 ms | 16,340,428 bytes |
| Running Vite process, warm reload | 481 ms | 1,602 ms | 47,784 bytes |
| Fresh isolated Vite dependency cache, HTTP disabled | 7,160 ms | 8,252 ms | See report |
| Production preview, HTTP disabled | 497 ms | 1,716 ms | 1,955,309 bytes |
| Production preview, final warm reload | 379 ms | 1,520 ms | 4,584 bytes |

These are individual samples, not p95 or shader-complete/first-interaction guarantees. A middle production warm run was slower than its cold sample. The original minute-long screenshot was not reproduced as an isolated before/after benchmark. The fresh-process measurement used a separate dependency cache directory without deleting the user's existing cache. Caching improves network and repeated use; it does not reduce steady-state GPU work in the dense overview.

Detailed policies, changed modules, release-retention requirements and raw measurement paths are saved in [R3F-loading-cache.md](R3F-loading-cache.md). Production copies add approximately 35.1 MB of build storage and leave original assets untouched. Publish HTML, JS and fingerprint files together and retain previous hash files while active clients may need them.

On 12 October the user explicitly instructed: "forget about tests and do the work faster." No full regression or production authoring rerun was performed after that steering. The final watcher/policy/recovery/header edits received static review and the successful final build; earlier passing checkpoints are not misrepresented as coverage of every subsequent edit. The new recovery browser tests remain available for a later run.

## Preserved assets and compatibility

Original `.blend`, GLBs, requested booth dimensions and source map images were preserved. No dependency upgrade was required. Tests keep feet conversion at exactly 0.3048 m/ft. Native booth hashes were compared with the pre-experiment values; all eight matched.

| Protected source | SHA-256 |
| --- | --- |
| `docs/R3F-plan.md` | `50cf476a9274106d034fddbfb67e95950239ab5e20966458593d15757245180c` |
| `docs/R3F-plan-review.md` | `b340ee42b97f7d4835dae8007db547cfd733646dfe099a22455930ae30ea8862` |
| Original mall `.blend` backup | `92bcbf50fea02f656e328314521940ff1799810d3ebe68dc14596ba0b5ad7a5f` |

The existing dirty repository migration remains untouched. Rollback of runtime code must preserve the current saved-layout schema and native source checkpoint.

## For the chosen ones

Migration continuation, 13 October 2026: the procedural inventory, canonical authoring, drafts/publication and full From/To wayfinding implementation are now integrated. The current evidence and compatibility/release limits are recorded in [R3F-migration-execution.md](R3F-migration-execution.md). This supplements the earlier performance implementation; it does not imply that prior browser/test results cover the new migration.

A cache key is part of the renderer's correctness contract. Clearing a hook cache does not dispose its GPU resources, and aborting HTTP does not necessarily cancel a decoder already parsing bytes. Correct ownership needs three separate decisions: which revision may commit, which consumers still hold a resource, and when an obsolete result can finally be disposed. Warm reuse becomes safe only when those decisions agree.
