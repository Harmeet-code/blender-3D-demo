# Admin authoring rendering status

Updated: 2026-10-28

## Page roles from source

- `src/floor-plan-builder/entry.tsx` routes DEV-only `?furniturePreview=1` to the standalone procedural furniture showcase, which demonstrates variants and top/isometric views without editor controls.
- DEV-only `?wayfindingPreview=1` selects the wayfinding preview fixture. Otherwise the entry renders the floor-plan studio.
- `?eventId=<id>` selects the studio document/store/persistence key. With no parameter, the studio uses `floor-plan-studio`.

## Active studio rendering

- `FloorCanvas.tsx` is the active authoring renderer. It uses React Three Fiber demand rendering, DPR `[1, 1.5]`, and the existing shadowed materials. DPR is fixed across zoom; no idle or zoom DPR downgrade was added.
- The authored floor shape at y=0 remains a standard-material shadow receiver. When a raster is configured, the transparent image plane is at y=.001 and a separate shadow-only receiver is at y=.002. The image material uses polygon offset factor and units `-1`; the shadow layer is retained above it so fixture shadows can show over the raster. The legacy world-viewer `TiledUnderlay.tsx` retains its pre-existing `polygonOffsetUnits={-1}` change; that path was not altered here.
- Camera clipping planes now derive from floor bounds and maximum object height, with a small margin. They update on camera-control changes rather than using a fixed far plane of 5000. This is a source-level change; no visual comparison was run.
- `BoothScreenLabelLayer` draws booth number and company/name labels into one pointer-transparent 2D canvas mounted over the R3F canvas. Labels use a 14 CSS-pixel font at the renderer pixel ratio, clip offscreen anchors, prioritize the selected booth, and cull collisions in dense views. This avoids one DOM node and one React update per booth. The old top-down `PlanCompanyTitle` mesh is suppressed when screen labels are enabled; physical fascia signs remain.
- Hover tooltips have a 500 ms delay and are cleared during pointer actions and camera gestures. The tooltip layer ignores pointer input. The scene interaction owner also added camera gesture locking and timer cleanup.
- Active procedural renderers now keep their detailed mesh/accessory paths enabled across camera distances. Camera-distance `useFrame`/React-state LOD thresholds were removed from booths, barriers, benches, bins, entrances, information desks, kids zones, planters, tents, water stations, washrooms, tables, circulation objects, avatars, exits, first-aid stations, and food kiosks. Door, wind, water-flow, beacon, and circulation animation callbacks remain for their interactive behavior. This is a source-level quality change; its performance cost on representative hardware was not measured.

## Loading and image readiness

- `StudioPage.tsx` uses `MiniatureVenueLoading` from `BuilderLoading.tsx`. The miniature is CSS/SVG only, uses no new assets or WebGL work, and provides optional mouse/keyboard booth and visitor interactions. It displays measurable progress only when supplied and supports the existing retry/error contract.
- The existing loading visibility delay is 400 ms so a quick load may not show an overlay. Once the canvas is ready, the overlay immediately stops intercepting input and fades out over 180 ms; it does not hold the canvas behind a readiness timer.
- `useFloorImage.ts` reports a decoded texture, load/decode failure, or a five-second timeout with a recoverable fallback notice. `FloorCanvas` treats a blank URL, loaded texture, or image error/timeout as image-ready, then waits for a submitted frame before signaling `onStableFrame`. A timed-out image may still load later and replace the fallback; this recovery path is intentional, so a late image arrival can still visibly change the floor after the first ready frame.

## Verification boundary

- The source-level integration is complete. The accepted UX plan and implementation status are in `src/admin-authoring-ux-plan.md` and `src/admin-authoring-implementation-status.md`.
- Tests, browser walkthroughs, visual comparisons, and representative 400-booth/100-item frame-time measurements were explicitly deferred. No claim is made that the supplied recording defect or everyday-laptop performance has been verified. The attached local recording was inaccessible under the browser's file URL policy, and no alternate access method was used.
