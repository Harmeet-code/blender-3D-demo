# Admin Authoring Implementation Status

This tracks implementation of [admin-authoring-ux-plan.md](./admin-authoring-ux-plan.md). The interview plan remains unchanged and is the source of verbatim user requirements.

## Ownership

- State, persistence, Inspector, StudioPage, inventory, and routing: `interview_design`.
- Canvas input and viewport interactions: `scene_interactions`.
- World rendering, loading screen, labels, visual quality, and performance: `rendering_experience`.

## First milestone

- [x] Draw rectangle and polygon booths from the viewfinder, including polygon footprint editing (source implemented; interactive verification deferred).
- [x] Place furniture and customize per-instance supported properties (source implemented; persistence roundtrip unexercised).
- [x] Resize live with dimensions overlay and persist geometry (source implemented; save/reload verification deferred).
- [x] Edit zones and POIs in the same shared draft (source implemented; integrated walkthrough deferred).
- [x] Preserve camera controls during selection/editing and keep camera position when saving (source implemented; interactive verification deferred).
- [x] One top-right Save persists edits; Undo/Redo spans the session and remains available after Save. The persistence service has no background server-write path; Save records the exact submitted snapshot as the discard baseline.
- [x] Navigation away from unsaved edits offers Stay / Discard and leave; browser refresh/close keeps the native beforeunload warning.
- [x] Reload path restores the saved layout from explicit draft persistence; a live reload roundtrip was not exercised.
- [ ] Benchmark 400+ booths and 100+ other items on an everyday laptop; no representative benchmark has been run.
- [x] The miniature venue loader is active in StudioPage and uses actual canvas readiness; no artificial post-ready delay was added.
- [x] Recording-related tiled-underlay depth-bias source change is present; visual confirmation remains deferred.
- [x] Zoom-driven quality LOD switches were removed from BoothObject and the active procedural renderers; detailed rendering no longer switches down with camera distance. Overall high-quality/shimmer behavior still needs interactive visual confirmation.
- [x] Screen-sized booth labels and delayed/suppressed object tooltips are implemented in source; visual behavior remains unverified.

## Assigned state/editor/routing work

- [x] Valid staged object/zone edits enter the shared unsaved document before selection/tool/floor changes; invalid partial forms remain staged with validation feedback.
- [x] Selection changes and Customize edits use one draft; Customize is the complete sidebar editor.
- [x] Rotation is controlled in Customize with synchronized slider and numeric input; scene rotation and Q/E shortcuts are removed.
- [x] Per-instance item customization, common fields first, supported options grouped by item, polygon coordinates under Advanced; roughness, metalness, and position X/Z controls removed.
- [x] Standard and polygon booth entries removed from inventory; furniture variants and internal viewfinder booth factories remain.
- [x] Shared store supports explicit Edit footprint mode for polygon booths; canvas handles are owned by `scene_interactions`.
- [x] Type-based placement rules: booths cannot overlap booths; furniture may sit inside booth footprints (interactive verification deferred).
- [x] Session Undo/Redo; Save does not clear history; Undo after Save marks the plan dirty.
- [x] Left inventory and right Customize sidebar independently collapse with remembered state; selection does not reopen a collapsed inspector; Customize opens it.
- [x] Incomplete floor plans can be edited/saved; missing walk zone at route request shows an actionable toast.
- [x] Source review confirms route planning includes authored collidable-object obstacles and committed geometry changes update route input.
- [x] Local Apply/Discard controls removed from Inspector and floor setup; one top-right Save persists object, zone, POI, and floor edits; failed Save preserves the local draft.
- [x] Page/query routes documented below from source.
- [x] Out-of-boundary release restores last valid state and reports one brief toast (interactive verification deferred).
- [x] Save snapshot/revision and navigation guard source implemented; save/reload roundtrip and in-flight navigation dialog remain unverified interactively.

## Page/query role evidence

- `src/floor-plan-builder/entry.tsx` selects dev-only component previews by query key. `?furniturePreview=1` renders `FurniturePreview`; it exposes table variants, foliage variants, waste streams, and an isometric/top camera toggle. In production, those preview components are omitted and regular `StudioPage` renders.
- `?wayfindingPreview=1` selects the dev-only `WayfindingPreview` fixture page; the wayfinding README describes local scenarios as fixtures that do not save or publish event data.
- `eventId=floor-plan-studio` is read by `StudioPage` as the event/building key, with `floor-plan-studio` as default. It is not a separate page; it scopes persistence and local recovery keys.

## Validation

- User requested no automated tests. Focused tests were run before that steering arrived; no test suite is being run now.
- [x] Final `bun run build` passed after procedural LOD removal and Inspector history grouping. The build's initial `tsc -p src/floor-plan-builder/tsconfig.json` passed; Vite production client and Bun server bundles also succeeded. Vite warned about large minified chunks (`StudioPage` about 1.80 MB and `WalkthroughSensors` about 2.26 MB).
- [ ] Changed-file `oxlint` still exits nonzero on curly-brace style findings in inspected unchanged sections (including the floor image upload flow, existing geometry fallback, and existing route/store helpers); new/touched flagged lines found during review were corrected. No separate HEAD-wide lint baseline was generated. `oxfmt --check` reports all nine owned files need formatting; no broad formatting rewrite was applied.
- [ ] Interactive verification of save/reload, camera preservation, Undo after Save, invalid placement, route blocker behavior, and recording-related rendering remains deferred at user request.
- [ ] 400+/100+ everyday-laptop workload remains unbenchmarked.

