# Floor plan studio

The new frontend lives entirely in this directory. `src/app/main.tsx` only chooses its entry for `/admin/floor-plan` or `/floorplan/admin/floor-plan`. It owns its Zustand state, draft history, view preferences and navigation worker; shared shadcn components, geometry helpers, authorization, wire schemas and API clients keep the existing app's conventions.

## Run

```powershell
bun run dev:floor-plan
# http://127.0.0.1:5175/admin/floor-plan?eventId=floor-plan-studio

bun run build:floor-plan
bun run preview:floor-plan
# http://127.0.0.1:4175/floorplan/admin/floor-plan?eventId=floor-plan-studio
```

Use the real event ID in the query. Dev/preview proxy `/api` to the existing server on port 8000. Viewing and local authoring work while the backend is unavailable; protected draft reads/writes, image uploads and publication need that backend and an authorized venue session. Credentials stay in the existing in-memory session.

Production output is `dist/floor-plan-builder/`. Host it under `/floorplan/`, with the studio routes falling back to `src/floor-plan-builder/index.html` within that output. Proxy `/api` to the unchanged backend. Static hosting must serve the generated ES module navigation worker and Recast companion bundle. The standalone Vite config avoids three missing helpers in the existing root config; it does not repair or replace those helpers.

## Authoring and preview

- Drag inventory items onto the floor, or select a recipe and place it by clicking or entering coordinates. Every placement gets a new UUID. Rectangles, free polygons, the reference booth presets, resize handles, aspect lock and resize snapping are available.
- Object, zone and floor forms stage changes. **Apply** commits a saved step; **Discard/Escape** restores the previous applied document. Invalid inputs remain editable. Removal hides the item in a preview until **Apply to save**.
- Draft undo/redo is separate from applied saved-step undo/redo. Redo-only draft history still blocks a floor switch until resolved. Saved steps are scoped per floor. Connector actions record only their related changes elsewhere; undo refuses to overwrite a landing edited later on another floor. Resolve that later edit there before retrying. Floor deletion discards history steps that depend on the deleted floor.
- The Groups & selection panel groups objects for rigid movement/rotation/duplication and provides previous/next selection. Shape and size edits remain individual. Group identity persists in recipe metadata.
- Floor-image removal and floor deletion require confirmation. Image upload completion is rejected if the document changed during upload. Calibration takes three source-pixel points plus known metric width/depth, and reprojects applied geometry and preserved records once.
- Preview venue shows booth details, the status-colored Floors directory, hover details, heat/availability/night controls, iso/top/reset/orbit lock and a 1200 ms booth tour. These are ephemeral view settings; they do not rewrite authored colors or save the document.
- Directions use the existing Recast worker, transformed footprints and individually placed connector landings. START/REACHED identify the selected endpoints. An endpoint join that cannot retain clearance produces an error rather than a line through blocked geometry.
- Existing POIs and portal landings are editable reference markers. Connector controls preserve source parameters, stage target coordinates with the object form, and expose landing editing/disconnection. Reference markers keep their original landing point without inventing stair dimensions.
- Recalibration preserves residual planar shear/reflection in procedural metadata. Rendering, footprints and resize handles use the same transform. Legacy metric images use their loaded natural dimensions before calibration; unknown image dimensions block the operation.

Shortcuts ignore editable fields, repeated events and conflicting modifiers. Shift+S applies; R resizes; M moves; D duplicates; B draws a rectangle; P draws a polygon; T cycles booth presets; I cycles stairs/entrance; Z draws a walkable rectangle; X arms removal. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z undo/redo. Enter/double-click/right-click finish a polygon. The in-app shortcut dialog and labelled controls provide alternatives.

## Data compatibility

`model/adapter.ts` emits the existing `BuildingLayout` wire schema and parses every output through `buildingLayoutSchema`. Extra instance fields would be stripped by the backend, so procedural metadata uses a bounded, versioned `fpb:v1:` URI-encoded JSON envelope in `assetId`. Required transforms, dimensions and collision fields remain ordinary instance fields. The wire transform wins during decode. Unknown reserved versions stop import/load visibly; unrelated legacy asset references are preserved as procedural placeholders.

Booths synchronize canonical Rooms, authored entrance/information/exit objects synchronize owned POIs, zones use `authoring.zones`, and linked connectors synchronize Portal entries. Original calibration references and accumulated transforms keep legacy walls, obstacles, POIs, room entrances and logistics anchors aligned through image/calibration changes. Malformed imports and late loads must not replace newer local work.

The existing visitor frontend does not understand the reserved recipe envelope as a model asset. It is supported by this new frontend and its preview. Actual-app payload integration and migration of the old visitor renderer remain separate work. No server schema, endpoint or database migration is included.

The unchanged shared/server publication gate also uses bounding boxes for unknown procedural asset IDs. It can reject a spawn/landing near a concave object's empty bounding-box region even when the studio's exact polygon and Recast accept it. Calibration shear also exceeds that consumer's ordinary scale/yaw representation. Tasks 44 and 49 remain open for physical-consumer integration and authenticated persistence acceptance; schema parsing alone does not complete them.

Draft autosaves are serialized after a two-second debounce of applied changes. An older save acknowledgement cannot mark newer work Saved. Finalize flushes the draft, checks physical/calibration/connector readiness and uses the existing client's publication-version handling. A successful authenticated save/publish/reload has **not** been established in this session.

## Inventory and diagnostics

There are 22 editable recipes. Booths use new procedural polygon geometry. Stairs, elevator, escalator and ramp now have detailed procedural construction and dedicated controls; see [circulation-design.md](circulation-design.md) for corrected dimensions, animated mechanics, landings and routing limitations. Tents expose barn/gazebo/marquee, bays, eaves, overhang, poles and canopy/pole materials. Washrooms expose gender-specific signage. Remaining amenities/furniture are refined separately. Later realistic assets must also remain procedural; there is no external model loader.

Generic inventory dimensions are limited to 0.1–1000 m on each axis; polygons additionally need at least 0.01 m². Refined booths and circulation recipes have narrower physical limits. Booths use explicitly requested 0.10/0.15 m clearance with shared closed-wall snapping; new connectors reserve clear approaches. Legacy/unbuffered footprints may touch edges but cannot overlap. Tent overhang participates in the footprint. Ramp proportions and wheelchair markings are not an accessibility certification.

The user's detailed booth description is implemented in [booth-design.md](booth-design.md): shell layouts, per-edge openings, fixed construction profiles, carpet/panel/aluminum materials, surface overrides, generated signage, roof modes and an animated optional closet. Open interiors participate in studio Recast navigation. Use `/admin/floor-plan?boothPreview=1` in development for an isolated visual preview without modifying event data.

Use `/admin/floor-plan?circulationPreview=1` in development for the isolated stairs/elevator/escalator/ramp collection and animation controls. Native ramp traversal, directional escalator routing, exact machinery colliders and transit cost/accessibility metadata remain engine integration work; current flat portal semantics are unchanged.

In development only, `?debug` enables source/world coordinates and the read-only console helpers `window.FLOOR_PLAN_AUDIT.audit()` and `.coordinates(x, z)`. They omit credentials and contact data, and are removed on unmount. Production query parameters cannot enable them.

## Verification record — 15 October 2026

- Feature TypeScript, oxlint and formatting checks pass. The standalone production build passes, including the Recast worker. The development page and Canvas render in the in-app browser.
- The root application build fails before bundling because `scripts/vite/asset-revisions.ts`, `scripts/assets/archive-runtime-guard.ts` and `scripts/vite/mall-blueprint-cache.ts` are absent. Existing backend-route and editor-setting changes were left untouched.
- The build reports large Three/Recast chunks. No measured FPS, latency, accessibility or full demo-interaction acceptance is claimed.
- No tests were authored or run, per the user's instruction. The original test tasks 28–42 remain deferred. Live backend round-trip evidence remains outstanding.
- This audit's read-only published-layout request could not connect to port 8000. The existing browser page renders with no captured warnings/errors; its load-error state and local recovery prompt remain visible. No recovery draft was restored/discarded and no event was published during inspection.

The detailed audit, corrected deviations and requirement mapping are in `.kiro/specs/admin-floor-plan-builder/implementation-audit.md`. The task record now reports 46 implementation/check tasks reviewed, two backend tasks open, and 15 test tasks deferred.

The canonical scope and task accounting remain in `.kiro/specs/admin-floor-plan-builder/`; the restored historical snapshots are unchanged.
