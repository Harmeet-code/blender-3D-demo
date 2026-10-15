# Design: Admin Floor Plan Builder

## Overview

An independent studio at /admin/floor-plan?eventId=<id>. The entrypoint bypasses the old App
composition and mounts the existing AppProviders around a lazy studio page. The old routes keep
using App. All feature code is under src/floor-plan-builder. No backend files or shared wire schemas
change. The required behavior comes from demo/src/main.js, editors/BoothEditor.js, PoiEditor.js,
ZoneEditor.js, FloorDraftEditor.js, authoring/AuthoringHistory.js and NameUtils.js.

## Architecture

- model/types.ts: Zod metadata schemas, editor model inferred from schemas, no duplicate union types.
- model/inventory.ts: declarative procedural recipe catalog and dimension/collision defaults.
- model/geometry.ts: local/world footprints, validated editing, source coordinate conversion.
- model/adapter.ts: reversible wire document conversion and reserved assetId envelope.
- model/store.ts: isolated Zustand factory, transactional history, validation and draft revision state.
- model/directions.ts: bounded metric grid routing, walkable masks, obstacle clearance, portal edges.
- model/shortcuts.ts: pure command resolver with demo parity and focus/modifier guards.
- model/surface-color.ts: interior footprint samples in image pixels, explicit/fallback colors.
- api/persistence.ts: existing API client facade and serialized revision-aware save queue.
- components/StudioPage.tsx: reference-style sections, inventory, toolbar and inspector.
- components/FloorCanvas.tsx: one demand Canvas, pointer capture and plane projection.
- components/ProceduralObject.tsx: new object renderers, owned memoized geometry, no loaders.
- components/Inspector.tsx: typed booth/POI/zone/floor forms and explicit apply/discard.
- hooks/: load/recovery/autosave, shortcuts and image sampling lifecycle.
- styles.css: page-scoped studio layout, responsive panels and state feedback.
- tests/: Bun and Playwright acceptance scenarios; a feature config permits standalone verification.

Shared imports are building/schema types, spatial schemas, geometry/coordinate helpers, UI primitives,
existing API clients and AppProviders. Never call useLayoutStore/useWorldStore from this studio.

## Canonical editor model

Every floor has source Floor metadata plus metric objects/zones. Objects have a fresh UUID, recipe
ID, local polygon when applicable, metric position, yaw, scale, dimensions and validated metadata.
Booth metadata includes all fields from the reference form. A floor document contains the metric
boundary/spawn plus zones and objects. The original parsed BuildingLayout remains the wire baseline
so unmanaged rooms/instances/portals and optional fields survive. Imported legacy rooms/instances
can be displayed/edited through an adapter without loading external models.

Use a flat z.discriminatedUnion for recipe-specific definitions or a single validated object schema
with explicit recipe enum and refinements. Reuse point2Schema/finiteNumberSchema from types/spatial.ts;
private building-schema helpers are not imported. Polygons store unique vertices, implicit closing
edge, >=3 finite points, simple intersections and metric area >=0.01. The shared isSimplePolygon is
compatible with this representation. No first===last condition exists.

## Persistence adapter

The unchanged backend strips extra fields from instances. Therefore a reserved procedural asset ID
is the entire validated recipe envelope:

`fpb:v1:` + encodeURIComponent(JSON.stringify({recipe, metadata, polygon, version:1}))

position/yaw/scale/dimensions/collidable remain normal instance fields. The envelope contains only
bounded editor-owned data, never credentials or arbitrary URLs. Enforce encoded length and schema
limits on import. Decoder handles unknown prefixes as unmanaged legacy data and reports malformed
reserved envelopes instead of discarding them. Encode with deterministic field order.

Booth instances also synchronize Room(id, floorId, type:booth, source polygon, label, price). Decode
uses the canonical Room polygon converted to local metric points; if the old editor modified that
polygon, it takes precedence over envelope geometry. Directional entrances synchronize POIs; stair
links synchronize Portal entries for every connected floor. Zones persist under authoring.zones.
A room and its visual instance are one entity for collision and removal. Floor removal updates all
related entries. All generated records use explicit ownership IDs/prefixes so unrelated data stays.

The wire contract remains buildingLayoutSchema. Mandatory authoring fields boundary, obstacles,
spawn, instances and underlayOpacity are present. Every generated instance has a reserved assetId
and positive finite dimensions/scale. Round-trip tests parse encoded layouts through the REAL
buildingLayoutSchema before decoding. This proves unknown-field stripping cannot lose metadata.
Existing viewers do not resolve reserved recipes: use a separate event ID by default; only the new
studio renders them. The actual app payload can later replace this adapter.

## Transactions and history

A complete operation is validated before replacing immutable floor state. Invalid operations keep
both the previous document and the editable ghost. History stores before/after active-floor slices,
including only related canonical records; never whole-building snapshots for a per-floor undo.
New edits clear redo and history is bounded. Floor CRUD uses an explicit document transaction with
an independently managed undo scope. Temporary drawings/forms are separate from applied document
revisions. Unsaved active gestures block floor switching. Apply commits one transaction; discard
clears only the unfinished edit. Local drafts are namespaced by event and schema version.

## API, concurrency and authentication

Use existing layouts-client.ts functions; publication endpoints return {saved:boolean}.
getLayout attaches fetched version identity; call acceptLayoutVersion only when accepting that
fetched published object. saveLayout advances expected version itself on authenticated publication.
Draft saves do not require/advance publication versions. Do not access private client maps.

Autosave captures immutable wire snapshot plus editor revision, queues writes, and marks Saved only
if the acknowledged revision still equals current revision. Abort/ignore stale event loads. A server
or local draft is offered for explicit restore; a published fetch cannot overwrite dirty local data.
Failed draft save leaves local data and dirty state intact; retry is an explicit action. Finalize
flushes a pending draft, verifies publishReadiness and publishes only the current document. An edit
made during publication remains dirty. 409 conflicts retain draft and offer explicit comparison/
reload. No blind automatic rebase. 401/403 offer existing venueLogin; session remains in memory.

## Interaction and shortcuts

Single owner for each pointer gesture. Orbit controls are disabled during authoring gestures and
restored on completion/cancel/lost capture. Sidebar HTML drag projects client coordinates to an
active-floor horizontal plane using Canvas bounds/camera; ghost uses that same point. Drop outside
Canvas/boundary is cancelled. Touch/keyboard can choose a recipe then place via click/numeric form.
Polygon vertices remain editable until Enter/double-click/contextmenu. Escape is non-destructive.

Shortcuts exactly follow R7 and the demo source. Ctrl/Cmd+Shift+Z returns after redo and cannot also
activate Shift+Z. Shift+M/D uses selection kind. Shift+X arms removal and requires target click.
Shift+S applies dirty form or drawing, rather than replacing its meaning with backend save.
Focus guards cover form controls/contenteditable. All actions also have labelled DOM buttons.

## Geometry, collision and color

Each object is a floor-contact local recipe inside a group transformed by metric position, floor
height, yaw and scale. Booth Shape vertices use (x,-z) with an X rotation of -PI/2 so extrusion
becomes positive world Y. Memoize/dispose allocated geometry. Use rectangle/polygon solid previews,
correct yaw and dimensions, stairs whose steps rise above Y=0, tent roofs and a standing person
with separate legs/body/head. Native JSX mesh/group/material elements, never Three classes as JSX.
No TubeGeometry workaround for polygon solids and no external model/environment downloads.

Exact transformed footprints determine collisions after AABB broad phase; reject outside-floor or
blocked-zone placements, allow edge touching/zero gap. Walkable/display zones can overlap. Ignore
noncollidable objects and deduplicate canonical room/instance collisions. Default booth extent and
all dimension limits are metric; convert through floor calibration for persistence only.

Surface color reads the floor ORIGINAL image via a small canvas, not the R3F framebuffer. Choose
interior points of concave booth footprints, map to source pixels and compute a bounded median of
opaque samples. CORS/load failure uses a configured fallback and visible notice. Resample after
transform, shape, image or calibration changes. Explicit color wins. Selection outlines do not
rewrite base color. Rendering is demand-driven; high-rate ghosts do not create history/autosaves.

## Floor management, navigation and accessibility

Metric blank floors initialize boundary/spawn/height/image metadata. Image upload uses the existing
media client endpoint and only commits a returned URL. Calibration uses three noncollinear source
corners and known metric dimensions; reexpress object/zone source positions consistently. Keep
undo and invalid-polygon handling. Remove-image preserves metric geometry; floor deletion is
confirmed and cannot remove the last floor. POI forms expose orientation and per-floor landings.

Direction preview uses a bounded grid in world meters. Cells must lie inside floor boundary and
walkable zones, avoid blocked zones/object footprints with avatar clearance, and connect to portal
landings. A* on same-floor cells plus paired portal transitions yields segmented floor routes.
Disconnected or invalid starts/ends show an actionable message. No direct obstacle-crossing lines.
Provide start/end selectors and show segment/floor instruction; this is a planning preview, not
multiplayer or a realistic avatar walking simulation.

DOM controls provide every edit operation without relying on picking: object/zone directory,
numeric positions/dimensions/rotation, vertices, floor selector, apply/discard/undo/redo. Canvas has
an accessible label and status region. Use shadcn dialogs for destructive confirmations, labelled
fields, keyboard-focus rings and compact responsive panels.

## Testing Strategy

Bun model tests: metadata/schema round-trip, unknown record preservation, polygon implicit closure,
concave footprint collisions, edge contact, per-floor history, exact shortcut modifiers/focus,
draft race handling, malformed imports and direction routing. Browser tests mock the existing API
for deterministic drafts/auth/version failures, use actual R3F Canvas, and exercise inventory/drawing,
properties/zones/floors, contextmenu/double-click, recovery, finalize and procedural asset isolation.
Use installed Playwright, testing-library, TypeScript, oxlint and oxfmt. No new test framework.
Record build/browser limitations separately from passes. Performance checks use a declared viewport,
DPR, browser renderer and >=50 objects; no hardware-independent 60 FPS assertion.

## Correctness properties

- decode(buildingLayoutSchema.parse(encode(editor))) preserves editable object data.
- Input polygons contain distinct vertices; rendering closing an edge never adds a storage vertex.
- Undo on floor A cannot modify floor B.
- Cancelled gesture/drop/delete cannot modify the document.
- Late save/load responses cannot mark newer edits saved or overwrite dirty work.
- Finalize never accepts an old fetched version after publication.
- Every required inventory recipe creates exactly one fresh instance and renders without model loads.
- Route segments stay walkable and use actual connector entries.

## Future work

Photorealistic procedural geometry/materials, larger-catalog batching and the real application
payload adapter. No external 3D model pipeline is introduced.
