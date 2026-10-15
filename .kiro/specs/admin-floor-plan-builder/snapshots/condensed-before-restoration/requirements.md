# Requirements: Admin Floor Plan Builder

## Purpose and source of truth

Build a separate admin frontend under `src/floor-plan-builder/`, accessible at
`/admin/floor-plan?eventId=<id>` (also under the deployment `/floorplan/` prefix).
Use `C:/Users/HarmeetSingh/Desktop/Projects/demo` as the behavioral and UI reference.
Port its authoring logic to typed React; do not import its imperative scene or booth renderer.
Use the installed React 19, R3F 9, Three.js, Zustand, Zod 3 and shadcn components.
Do not change backend endpoints, schemas, database, authentication or old editor state.

## Terms

- Polygon: at least three distinct finite vertices, implicit final edge to the first vertex.
- Source point: a floor's persisted coordinates, pixels or meters according to its calibration.
- World point: an X/Z pair in meters. All rendering and collision calculations use world points.
- Applied edit: an undoable document transaction, separate from an unfinished drawing or form.
- Draft saved: backend acknowledged the specific document revision; it is not publication.
- Finalize: explicitly publish a structurally valid, physically ready document.

## R1. Route and isolation

1. The route opens an independent full-page studio with its own store and Canvas.
2. All new feature logic, rendering, styles, tests and entrypoints live in the new subtree.
3. Shared read-only schemas, geometry, UI and API clients may be imported. Only mounting integration
   touches the existing frontend. No Blender, GLB or GLTF loading is allowed in any phase.
4. Event identity is explicit in the URL. An unsaved event-specific local draft survives reload.
5. Existing routes remain reachable and are not modified by editor actions.

## R2. Reference authoring and UI

1. Use the reference's floors/booth directory, expandable editor sections, properties, POI,
   walkable-zone tools, calibration, save status, finalize and shortcut help as the UI structure.
2. Booth fields include number, name, width/depth, price, status, company, type, explicit/automatic
   color, height, rotation, YouTube URL, gate, tags and contact name/email/phone.
3. Provide rectangle drawing, polygon drawing, preset placement, move, duplicate, resize and removal.
4. Pointer drawings display a preview. Enter, double-click or right-click finishes a polygon;
   Escape cancels without modifying the document. Invalid drawing remains editable.
5. Shift+S applies unfinished editor changes. Application is one history transaction.
6. Names deduplicate case-insensitively; booth numbers are unique on a floor. A duplicate gets
   a new stable ID and suggested number. Removal is armed and cancellable.
7. Per-floor undo/redo changes only that floor and its related rooms/portal entries.
8. Switching floors with an unfinished edit is blocked until apply or discard. Applied changes
   may switch floors and remain dirty until draft save completes.

## R3. Inventory and procedural rendering

1. Inventory definitions have stable recipe IDs, dimensions [width,height,depth], category,
   collision policy, display name and procedural renderer. Each drop creates a fresh instance ID.
2. Required recipes: rectangular and polygonal booths, stairs, barn tent, entrance,
   men's washroom, women's washroom, kids zone and standing person.
3. Also provide elevator, escalator, accessible ramp, information desk, seating, table,
   barrier, planter, waste bin, food kiosk, drinking water, first aid and emergency exit.
4. Drag from inventory onto the active floor shows a ghost and validity feedback. Outside-floor,
   outside-Canvas or cancelled drops create nothing. Provide click-to-place and numeric controls
   as keyboard/touch alternatives.
5. All objects use new procedural R3F geometry, correct floor-contact origins, dimensions,
   yaw, scale and floor elevation. Closed polygon solids use Shape/ExtrudeGeometry.
6. Use demand rendering, owned/disposed geometry, simple raycast surfaces and bounded DPR.
   Detailed realistic procedural objects are deferred to a later phase, never external models.

## R4. Polygon geometry and collision

1. Persist distinct vertices with implicit closure. Reject repeated vertices, nonfinite values,
   self-intersection and area below 0.01 square meters; accept concave simple polygons.
2. Convert through sourceToMetres/metresToSource exactly once at the persistence boundary.
3. Polygon points in editor objects are local meters. Position and yaw transform them to world;
   room polygons are then transformed to floor source coordinates for persistence.
4. Resize preserves polygon shape unless vertices are edited deliberately. Rotation uses radians
   internally and degrees in forms. Prevent negative/zero dimensions.
5. Validate transformed footprints against floor boundaries, blocked zones and collidable objects.
   Bounding boxes are only a broad phase; exact polygons decide collisions. Touching edges are
   allowed with zero required spacing. Never introduce an arbitrary mandatory 0.5m aisle.
6. Overlap with noncollidable references and walkable zones is allowed. A booth's canonical room
   and visual instance are one object and cannot collide with each other.

## R5. Underlying surface color

1. Automatic booth color samples an interior point/footprint of the floor image beneath the booth,
   using world-to-source calibration and the actual original image dimensions.
2. Resample after movement, rotation, polygon changes, floor-image replacement or calibration.
3. Exclude labels/transparent pixels using bounded footprint samples; use a deterministic fallback
   when no image exists, pixels cannot be read or the sample lies outside the image.
4. Explicit booth color overrides automatic sampling. Selection/hover feedback never modifies
   the stored base color. Do not sample the rendered Canvas or use the whole-floor dominant color.

## R6. Floors, zones, POIs and calibration

1. Create, rename, reorder and delete floors; confirm deletion and preserve everything on cancel.
   Do not delete the last floor. Remove affected portal entries and invalid connectors atomically.
2. Upload/replace/remove a floor image through the existing media endpoint. Preview failures and
   retain the existing image until upload succeeds. Calibrate using three image points and known
   width/depth, or explicitly confirm a metric floor. Preserve alignment when recalibrating.
3. Draw, edit, move, duplicate and remove rectangle/polygon walkable and blocked zones.
4. Place entrances and amenities with directional yaw. Stairs/elevator/escalator have an explicit
   linked portal ID, connected floors and an editable landing on every connected floor.
5. Set the standing person's start point and provide a direction preview between floor POIs/booths.
   Paths stay within walkable areas, avoid obstacles and use paired connector landings across floors.
   Report disconnected routes rather than drawing a direct line through obstacles.

## R7. Keyboard parity

Reference: demo/src/main.js handleAdminShortcut and demo/src/editors/*.js.

| Input | Behavior |
|---|---|
| Shift+S | Apply dirty editor/drawing changes |
| Shift+R | Booth resize mode |
| Shift+M | Booth/POI move mode, based on last selected entity |
| Shift+D | Booth/POI duplicate-placement mode |
| Shift+B | Add rectangle booth |
| Shift+P | Add polygon booth |
| Shift+T | Cycle booth preset |
| Shift+I | Cycle POI placement type |
| Shift+Z | Add rectangular walkable zone |
| Shift+X | Arm removal of booth/POI/zone |
| Ctrl/Cmd+Z | Undo active-floor applied edit |
| Ctrl/Cmd+Shift+Z | Redo active-floor applied edit |
| Escape | Cancel gesture/drawing/armed action |
| Enter / double-click / right-click | Finish polygon |

Ignore repeat/defaultPrevented events and shortcuts with conflicting modifiers. Do not intercept
input, textarea, select or contenteditable/shadcn form editing. Undo/redo modifier handling returns
before Shift-letter handling. Document all shortcuts visibly. Shift-drag duplication keeps the
original intact and commits only on successful drop.

## R8. Serialization without backend changes

1. Use buildingLayoutSchema/floorAuthoringSchema as wire contracts, without extending shared schemas.
2. Persist visual objects as authoring.instances with id, assetId, position, yawRadians, scale,
   dimensions and collidable. Encode versioned recipe identity and validated per-instance metadata
   in assetId with prefix `fpb:v1:` and URI-encoded JSON. Never invent a GLB URL.
3. Decode only the reserved prefix; preserve unknown/legacy instances and unrelated document fields.
   Treat malformed/version-unknown recipes as an error requiring recovery, not silently lost data.
4. Booths also own a Room with the same ID and source-space polygon/label/price. Canonical room
   geometry wins on import. Connectors own Portal records; zones use authoring.zones and entrances
   use authoring.pois. Keep these records synchronized in each transaction.
5. Metadata includes recipe, name/number, booth fields, polygon, color mode, stairs parameters,
   gender and linked portal identity. Ephemeral selection/ghost/history is never serialized.
6. Save -> backend parse -> reload -> decode must preserve every editable field. Legacy viewers
   do not understand reserved recipes; the new editor previews them. Use a separate event by default.
7. This adapter is temporary until the actual application's data contract is provided. It must be
   isolated so the transport can later change without rewriting authoring/rendering.

## R9. Drafts, publication and failures

1. Reuse getLayout/saveLayout/getLayoutDraft/saveLayoutDraft and existing venue auth.
2. GET/PUT /api/events/:eventId/layout and GET/PUT .../layout/draft are the only layout endpoints.
3. Accept the published fetch version when adopting that document; never call acceptLayoutVersion
   after saveLayout. Draft saves do not advance the publication version or require a version header.
4. Autosave after 2 seconds idle, serialize requests and bind responses to event/document revision.
   A completed old save must not clear newer edits. Retry explicitly after failure; retain local draft.
5. Display Unsynced/Saving/Saved/Error status, local recovery, server draft restore/discard and
   publish-readiness errors. Do not discard unfinished edits or overwrite dirty state on late loads.
6. Publish only on Finalize, after publishReadiness passes. Handle 401/403 authentication,
   409 conflicts, 422 validation and 428 missing-version errors; preserve all edits.
7. Conflict recovery requires explicit reload/compare, no automatic blind rebase or publication retry.
8. Use existing venue login inside the page when writes require authentication. No credentials
   enter persistent storage or the encoded metadata. Route access alone is not authorization.

## R10. Validation and acceptance

User update: automated test implementation and execution are deferred. Complete compiler, lint,
format and production-build checks; the scenarios below remain future acceptance criteria.

1. Run installed TypeScript, oxlint, oxfmt, Bun model tests and Playwright browser tests.
   Do not introduce Jest or change the existing package stack.
2. Test exact shortcut mappings, polygon validity, concave collision, metadata round-trip through
   actual backend schemas, unknown-record preservation, cross-floor undo and late save/load races.
3. Browser tests cover route, each recipe, inventory drops/cancellation, drawing, editing, zones,
   floor-switch guards, calibration, color sampling, draft/finalize and no external model requests.
4. Exercise keyboard-only editing, accessible form labels, mobile panels, focus guards, responsive
   Canvas resizing, context loss and unmount cleanup.
5. Performance evidence records viewport, DPR, browser, object count and hardware/software renderer;
   measure 50-object scene cost and avoid claiming universal 60 FPS or fixed network latency.

## Deferred

Hyper-realistic procedural materials/details, collaborative editing, bookings/payments and actual
application payload integration. No Blender/GLB/GLTF asset pipeline in any future phase of this feature.

