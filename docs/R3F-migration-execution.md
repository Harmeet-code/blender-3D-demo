# R3F migration execution

Updated: 13 October 2026. Source: `complete-migration-plan-with-vision.md`. The user authorized implementation and parallel subagents, superseding the original spec-only note.

## Implemented v1 slices

### Canonical authoring and publication

- Backward-compatible schemaVersion 2: walls/openings, named walkable/blocked/display zones and POIs. Source points normalize/re-express once; wall thickness/height and opening dimensions stay in meters. Opening offset is CENTER distance from wall.start; span is offset ± width/2.
- Blank 40 × 30 m metric floors, unique IDs, without copied images, obstacles or model placements. Uploaded/replaced maps require explicit calibration, using original source dimensions rather than preview dimensions. Two-point, affine rectangle and manual scale confirmation are available. Perspective/lens distortion requires rectification before import.
- Draw/edit/delete walls, openings, zones and POIs; inventory placement/drag-drop, rotation, resizing and duplication; boundary/obstacle/start/portal authoring. Gestures commit at the end, snap to 0.1 m unless Shift is held and cancel with Escape/source/floor changes. Existing elements can be deleted during required calibration to recover incompatible drafts.
- Same solid pieces feed instanced wall rendering, Rapier collision and Recast navigation, including elevated sill/lintel geometry. Concave blocked zones preserve their outlines. POI rings share one geometry/material/instanced draw per floor. Dollhouse presentation follows existing fading/collider rules.
- Separate unpublished draft GET/PUT `/api/events/:eventId/layout/draft`, absent draft returns null, private/no-store HTTP responses. Atomic local storage uses separate draft files; PostgreSQL uses standalone layout_drafts. Admin Save draft / Load saved draft / Save venue preserve edited-source guards, undo/history and publication-dirty state.
- Server/client publication checks calibration, complete new portal entries and physical clearance for starts/POIs/entries. No automatic raster tracing or hidden localStorage-only publication.

### Procedural built-in inventory

- Catalog/provider switched to procedural URLs and deterministic Three.js recipes rendered through R3F. No built-in catalog GLB import remains. Eight sized booths use procedural geometry while preserving exact requested outer dimensions, 2.8 m height, branding interfaces and collision footprints. The generic booth-frame stays 2.5 m high.
- 14 base identities + eight sized booths = 22 identities, with five additional low/opaque recipes = 27 generated quality recipes. Booth-ceiling is included. Dimensions, bounds, anchor/facing, sockets, required nodes, material roles and variants retain their reference interfaces.
- Material-based static merging keeps interface meshes separate; repeated assets retain existing spatial batching/resource ownership. Built-in resource owners are shared across clones and safely retired when unused. Legacy original-mall, saved shellUrl and uploaded custom GLBs remain explicit compatibility paths; this is not a claim that every runtime URL is GLB-free.
- Default `assets:validate` now constructs procedural assets without Blender/native files and verifies generated metrics/interfaces. CI uses source checks, procedural validation, optional original-mall compatibility, production build/chunk checks and uploads asset metric reports. Historical native validation/calibration/publish tools remain explicit opt-in commands.

### Navigation and exploration

- Search includes rooms/booths, POIs and avatar starts with stable scoped IDs. Real avatar origin is preserved; selecting a destination no longer teleports to the target-floor spawn before routing. Moving/removing destinations cancels stale routes; changing labels does not rebake navigation.
- From/To planner supports named destinations, current avatar origin and arbitrary picked floor points. Metric X/Z and floor inputs provide an accessible alternative to scene picking. Dynamic points stay ephemeral and are cleared on layout changes; previewing another origin never moves the avatar. Go routes from the live avatar to either a named place or a picked point through the same Recast worker.
- Step-free routing, actual route steps/progress/arrival/cancellation and one bounded retry when blocked are implemented. Minimap, follow camera, WASD/arrow-key walk/run controls and soft temporary path reveal settle back to demand-render idle.
- Bare-floor double-click teleports only to a clear point. Runtime, manual movement, paired-portal arrival and publication now validate the whole avatar footprint against concave boundaries, overlapping walkable zones, blocked areas and actual wall/furniture solids. Cached preparation and a 16 m spatial grid limit nearby checks. Unknown/nonfinite points are rejected; un-authored legacy floors preserve compatibility behavior.
- Paired-floor portal crossing is supported. Stairs/escalators/elevators have typed authoring controls and explicit entries on connected floors. Step-free routes exclude stairs/escalators; level transfer is intentional rather than continuous ramp physics.
- Straight stairs/escalator instances fit the two landing centers and actual floor rise; the 4 m rise / 7 m run reference preserves identity scale. Zero-run, missing-floor and unsupported multi-floor flights are rejected at publication. Instance fitting stretches the reference step/rail geometry; this is a navigation/visual contract, not building-code certification.

### Cache and motion ownership

- Built-ins no longer download/decode catalog GLBs. Shared procedural owners preserve resource identity across clones, batches, quality changes and inventory previews. Efficient graphics automatically selects declared low/opaque variants; sized booths retain their verified baseline recipe without duplicate fake quality-cache entries.
- Unused decoded/compiled common assets retire under a soft 128 MiB / 24-entry LRU budget after a short commit/reuse grace. Live consumers are never evicted. Weak scene owners preserve revision identity if a concurrent render commits after retirement; GPU buffers can reupload, while native ImageBitmaps remain valid until the source graph is collected. Active scene memory can exceed the cache budget and remains a scene-authoring/performance budget concern.
- Existing encoded-response, map/tile and immutable-content cache policies remain active. New upload measurements dispose their temporary private resources immediately. Reconstructed instanced buffers are disposed on their own lifecycle; shared geometry/materials remain cache-owned. Teleports reset manual velocity, preview spawns use one active layout consistently, and remote-avatar motion leases release on unmount.

## Verified reference and detachment policy

The reference COPY is verified: 276 files, 427,881,276 bytes (~408 MiB), 100 image references in `archive/blender-ref/reference-sheet.html`. User-owned originals are preserved. Archive payloads are local ignored copies; manifest/README/reference sheet are reviewable.

`reports/assets/native-retirement-audit.json` records original/archive SHA hashes for all 276 entries and identifies 19 detached src/assets/models binaries. The eight public booth exports, original-mall assets and saved floor/image media remain protected compatibility candidates. The ledger cannot delete files. A static provider audit does not prove that persisted PostgreSQL/local JSON documents have no old URLs.

Source/build guards and DTO archive-path validation forbid archive runtime URLs, including image/model/tile references. Archive copying is excluded from source watch/Tailwind scanning. No currently used asset was deleted.

## Evidence and limits

- `reports/assets/procedural-inventory.json`: all 22 identities / 27 generated quality recipes pass exact bounds (5 mm tolerance), neutral root, required nodes, sockets, material roles, branding UVs, preserved variant interfaces, generated budgets and low-detail triangles ≤ half generated baseline. Recipe SHA hashes identify the checked implementation. Reported bytes are unique geometry buffers, not download bytes or total GPU memory; reported draws are uninstanced mesh/group estimates, not whole-scene GPU draws.
- `reports/assets/original-mall-compatibility.json`: optional original-mall model 17,845,376 bytes, glTF validator zero errors/warnings, required Draco files present. This checks compatibility data, not decoded visual parity/navigation.
- `reports/assets/native-retirement-audit.json`: 276 reference hashes verified; zero files deleted.
- TypeScript checks passed after validator/tooling integration. Prior root production build succeeded in 13.11 seconds. `reports/performance/migration-inventory.png` and `migration-booth.png` provide browser visual checkpoints with zero page errors reported. These are functional snapshots, not visual-parity/FPS qualifications. Root final build/check evidence may supersede these timings.
- Final checkpoints also include `migration-typecheck-final.log`, `migration-world-visual.log` (zero page errors), `migration-world-final.png`, `migration-booth-polished.png`, `migration-safe-polished.png` and `migration-visual-finish.md`. Shared reflection lighting and static inventory studio/contact shadows improve material readability without changing reference albedos, physical dimensions, venue sun settings or 0.8 exposure.
- No broad unit/browser test suite was run in this migration pass, honoring the user's request to work faster. Existing tests and historical native tools were retained.
- Final integration gates: production TypeScript/Vite build and lint pass (lint retains nonblocking warnings), formatted source, and procedural asset validation pass for 22 identities / 27 recipes. Evidence is `reports/performance/migration-build.log`, `migration-lint.log`, `migration-format-final.log` and `reports/assets/procedural-validation-final.log`. The build still reports large Three/Rapier chunks. Avatar commands leave dollhouse mode so physics can run; scene selection keeps ordinary booth actions separate from point-picking.
- Latest production build finished in 12.55 seconds. The final read-only retirement audit reverified the 276 archive entries; no original files were deleted. Source originals and public media remain available for the requested compatibility features and historical reference/validation tools.
- Migration `004_r3f_only_layout.sql` is checked in but not applied: PostgreSQL/Redis are unconfigured locally. Local draft fallback works. A PostgreSQL deployment must apply migrations before using draft endpoints. Existing event data was not overwritten.

## Remaining and explicitly parked scope

- V1 authoring/inventory/wayfinding implementation is integrated, including arbitrary metric floor points. Remaining work below concerns compatibility retirement, external release qualification and later product scope; it must not be represented as already verified.
- The original mall route now uses native R3F geometry with complete 11,259-object coverage and zero GLB/Draco runtime requests. See `docs/mall-procedural-execution.md` for the implementation, visual evidence and cost limits. Saved-shell/custom-upload compatibility and any source deletion still require their own persisted-URL audit; original files remain preserved.
- Real laptop/iGPU qualification, visual comparison with Blender references and deployment CDN/server checks remain release evidence. Rich graphics can share resources and use adaptive quality, but no universal smoothness or pixel-identical path-traced claim is established.
- Authentication/roles, concurrent-editor revisions, tenant-safe relational identifiers and storage retention remain release work. Draft HTTP private/no-store does not protect access. Existing relational floor/room/portal primary keys are global; multi-event production publication needs explicit ownership/key design.
- v2/v3 shell/hospital/sports/airport/domain packs, preset scene templates and expanded medical/exterior inventories remain the plan's later phases; they were never part of the 22-identity v1 parity set.

## For the chosen ones

A doorway is a volume contract: its lintel must cast a shadow and collide above the avatar while preserving the same headroom in Recast. A shared solid-piece description prevents visually open doors becoming invisible route barriers. Similarly, code-generated buffers remove native transfer/decode work but do not by themselves reduce fill-rate or shadow cost.
