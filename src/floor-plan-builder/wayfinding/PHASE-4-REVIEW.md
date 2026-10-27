# Phase 4 review resolution

Reviewed 2026-10-19 against the supplied review and approved Phase 0 attachment.

- [x] **Composer decision:** removed the Three addon composer and its SSAO/bloom/outline/vignette passes. Emissive surfaces and a procedural billboard sprite supply glow. Every tier reports zero postprocessing passes.
- [x] **Minimap decision:** replaced the RenderTexture/Hud scene with a DOM 2D canvas, cached static map and 10 Hz imperative avatar updates. No additional WebGL render.
- [x] **Layering:** moved the area-aware Recast generator and MIT attribution into the shared building model. Shared navigation no longer imports the floor-plan-builder feature. Optional query fields, old call signatures/defaults and the single-worker architecture remain compatible. The cache must still include area/profile content to avoid reusing an incompatible mesh.
- [x] **Area contract:** general=1, accessible-only=2, restricted=3, queue-area=4. Restricted mask and queue cost use named constants. Paint order is explicitly general → accessible → queue → restricted, so overlapping queue paint cannot weaken a restricted zone.
- [x] **Documentation:** Phase 4 and performance sections existed in the current on-disk README, so that part of the review was stale. Removed the global Bun-availability claim and stale deferrals, documented the corrected renderer, and distinguished earlier measurements from current evidence.
- [x] **Static chair updates:** removed unconditional per-frame matrix uploads. Batches rebuild for committed floor changes and unmount during unfinished edits so the original objects display draft transforms.
- [x] **Production profiler:** guarded the Profiler wrapper with import.meta.env.DEV. The production runtime renders directly.
- [ ] **Unrelated toolchain/roadmap changes:** TypeScript 7, lockfiles, TODO and settings/skills changes were already present before Phase 4. Preserved; author intent has not been confirmed. No revert or dependency installation was performed here.
- [ ] **Rich-zone persistence/authoring:** remains an integration gap. Typed zones and holes are not persisted through the existing backend; authored zones are treated as general. Not claimed complete and no backend schema change made.
- [ ] **Hardware acceptance:** a repeatable 300-item fixture exists, but a hardware-wide 60 fps guarantee and isolated sub-200 ms rebuild are not established.

## Verification

- Standalone floor-plan TypeScript, focused lint and production build passed after the corrections. Vite retains the existing large-chunk warning.
- The real worker produced an 18.2 m restricted-zone detour; explicit override produced a 16.0 m route with a restricted-zone warning.
- Automated tests were skipped at the user's request. Updated only the existing queue-area assertion to match ID 4/flag 0x08. The reviewer's earlier 25/25 result is not attributed to this session.
- Browser checks exercised the canvas minimap through pause/seek, toggle, arrival and upper-floor switching. Toggling the minimap did not change GL draw counts. The development scene counter remained at two commits while the 300-item walk advanced. Rendering uses zero postprocessing passes on High as well as Off.
- A replacement route redrew the cached map; a 1100 × 780 resize and reset preserved its layout. A fresh browser run showed only the upstream Rapier initialization warning, with no shader or React cleanup errors. Production output contains no WalkthroughRuntime profiler marker.

## Corrected performance sample

2026-10-19, development browser, 992 × 415 main canvas at DPR 1, overview camera, 300 objects (20 booths/40 planters/240 chairs), a 90 m route, active playback. Approximately one-second windows after loading/warmup; same tier settings as the earlier sample. Main CPU render is JavaScript submission timing, not GPU timing.

| Tier | Frame interval | CPU render | Draws | Submitted triangles | PostFX passes | Visitors |
| ---- | -------------: | ---------: | ----: | ------------------: | ------------: | -------: |
| High |        16.7 ms |     5.2 ms |   821 |             106,010 |             0 |       20 |
| Off  |        16.7 ms |     4.7 ms |   642 |              54,552 |             0 |        0 |

With the 2D minimap disabled, High still reported 821 draws and 106,010 triangles (CPU render 4.8 ms in that sample). The map does not add WebGL submissions. CPU differences at this resolution are modest and variable; these are complete-tier samples, not an isolated glass/shadow benchmark. The 20-visitor/300-item fixture reached the display's approximate 60 Hz interval; no hardware-wide guarantee is claimed. The worker UI reported 119 ms routing, which includes mesh/query work and does not isolate mesh rebuild time.

The old six-pass High results remain explicitly labelled as superseded in README.md. Evidence image: wayfinding-phase4-review-benchmark-2026-10-19.png in this chat's visualization directory.
