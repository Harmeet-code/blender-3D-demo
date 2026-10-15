# Implementation audit — 15 October 2026

The canonical requirements, detailed design, all 63 task IDs and P01-P25 were reviewed against
the isolated frontend and the demo reference. This is a source review plus compiler/lint/build
verification and read-only inspection of the existing browser page. No automated tests or test
suites were authored or run, following the user's instruction. The historical snapshots are retained.

## Outcome and task accounting

- 46 implementation/check tasks have code paths and non-test review evidence.
- Task 44 remains open for authenticated save/publish/reload and physical-consumer compatibility.
- Task 49 is reopened: the studio and unchanged backend publication gate use different physical
  representations for procedural assets. This is a remaining implementation/integration gap.
- Original tasks 28-42 remain deferred. They are not marked complete or deleted.
- P01-P23 have implementation paths; that does not certify every interaction or live persistence.
  P24/P25 remain explicitly declined with their original reasons.
- Realistic procedural objects remain later work under Requirement 6.2; the current inventory
  contains procedural planning placeholders, including the standing avatar.

## Corrected deviations

Paths below are relative to `src/floor-plan-builder/` unless stated otherwise.

| Finding corrected | Implementation | Requirements / tasks |
|---|---|---|
| Inventory omitted placed-count badges and had no runtime recipe-definition schema | `components/StudioPage.tsx`, `model/inventory.ts`: per-floor counts, pending-removal exclusion, Zod definition/renderer/default/limit validation | 2.7, 11.1-11.10 / 9, 27, 53 |
| Floor add/delete controls remained in preview | `components/StudioPage.tsx`: authoring-only floor actions | 1.5-1.6 / 7-8 |
| POI placement lacked ghost rotation controls | Store placement yaw and cardinal/numeric controls; Canvas ghost and placed instance share yaw | 10.8, 13.19 / 47, 53 |
| Blank placement fields silently became zero | Numeric placement preserves invalid values and exposes field invalidity | 8.8-8.9 / 52 |
| Target-landing coordinates bypassed staged form history | `targetLanding` is validated recipe metadata; Inspector edits the staged object | 7.10-7.12, 13.19 / 46, 50 |
| Connector companion lost source steps/material/rotation settings | Companion creation retains source parameters with fresh identity and deduplicated name | 5.2, 7.12 / 13, 50, 53 |
| Connected landings had no edit/disconnect controls | Inspector links to each landing and exposes guarded disconnection; related changes use initiating-floor history | 7.3, 7.11-7.12, 13.19 / 50, 53 |
| Existing POIs and portal entries could not be authored and could reappear after removal | `model/adapter.ts`: exact reference markers, canonical ID/ownership tracking, managed-record reconciliation and duplicate identity cleanup | 7.12, 9.12-9.14 / 44, 50, 62 |
| Editing a legacy booth's name/color could drop door and feet-size metadata | Preserve unchanged canonical entrance/physical size and original asset references; transform directional metadata when recalibrated | 3.5, 9.13 / 44, 46 |
| Dragging could overwrite an unfinished form; secondary pointers could finish another gesture | Canvas refuses conflicting gestures and checks pointer ownership through move/up/cancel/lost capture | 2.6, 7.10, 13.14 / 46, 60 |
| Outside/cancelled inventory drag could leave the camera locked in placement mode | Inventory drag-end and scene drag cleanup restore selection controls without committing a placement | 2.6, 13.14 / 10, 60 |
| Invalid pole-coordinate JSON could be applied as an empty valid list | Inspector retains invalid text and emits an invalid sentinel until correction/Discard | 8.8-8.10, 11.9 / 52-53 |
| Double-click could repeat the final polygon vertex | Adjacent duplicate point suppression; finite/vertex-count guards | 3.3, 10.17, 13.12 / 24, 47 |
| Polygon intersection feedback lacked involved vertices/edges | Polygon schema supplies indexed duplicate/crossing errors, retains implicit closure and the 0.01 m² minimum | 3.3, 3.7-3.8, 8.9 / 24, 52 |
| Drawing and zone boundary errors were not shown until Apply | Canvas validates preview polygons, zone labels/boundaries and booth drawing placement; invalid pending zones are highlighted | 3.2, 8.2, 8.5, 8.9 / 21, 45, 52 |
| Offset-probe overlap checks missed thin/coincident intersections | `model/geometry.ts`: triangulated strict SAT after bounds rejection; edge contact stays permitted | 2.2, 8.6 / 4, 49 |
| Noncollidable references were rejected by blocked zones | Blocked-region collision applies only to collidable objects; all objects still respect the floor boundary | 2.8, 8.1 / 4, 49 |
| Non-booth room walls were absent from placement checks | Calibrated room-wall spans include entrance gaps and join existing obstacles/authored walls | 8.7 / 49 |
| Legacy metric images without persisted size were calibrated as pixels | Natural-size cache keyed by floor/image URL supplies the original metric-to-image basis; unknown sizes block calibration | 3.5, 4.6, 7.8 / 46, 48 |
| Calibration skew changed collision polygons without changing primitive bodies equivalently | Optional invertible planar matrix is shared by rendering/footprints/resize inversion; booths absorb reprojection into their polygon | 3.5, 7.8, 8.6 / 46, 49 |
| Names were deduplicated twice, creating avoidable nested suffixes | Object factories receive the complete name pool once, including floor/zone/object names | 8.8, 13.9 / 20, 47 |
| Stale loads and queued acknowledgements could race document replacement/publication | Persistence load sequence, publication lock and document epochs complement monotonic edit revisions | 8.11, 9.15-9.18 / 5-6, 50 |
| Cached/server draft identity could differ from the active event | Validate building/event identity before adopting drafts or published data | 1.8, 9.19-9.20 / 6, 26, 44 |
| Publication issues were truncated in a status line | Revision-scoped issue panel links to affected floors/objects, with nonmutating dismissal | 8.3-8.5, 8.9 / 7, 52 |
| Endpoint joins checked circular clearance and treated joined walkable masks as separate rooms | `model/navigation-clearance.ts`: sweep the shared square avatar, validate the union of positive zones and exact blocked/wall geometry before adding selected endpoints to Recast output | 7.13-7.14, 13.5 / 51, 57 |
| Camera fit could clip tall/large floors or narrow viewports | Perspective-frustum fitting uses all bounds corners, aspect, object visual height and dynamic clip/distance limits | 7.15, 13.6 / 58 |
| Zone selection lacked equivalent focus | Focus selected zone bounds through the same DOM/Canvas bridge | 7.15 / 23, 58 |
| Auto-tour could fail from an authoring tool or override a subsequent manual tool change | Owned tour session starts selection once and stops on manual tool/floor/revision changes; interval remains 1200 ms | 13.7 / 59 |
| Procedural ramp was stepped; several bodies exceeded nominal heights/bounds; material choices were visually identical | Continuous ramp wedge, normalized avatar/amenity geometry, positive furniture legs, tent pole/overhang footprint, distinct canopy/pole materials and consistent ghost opacity | 5-6, 11.3-11.9 / 12-19, 53 |
| Stair rail height was absent from camera and obstacle clearance calculations | Shared `visualHeight` includes raised rails and retains reference-marker behavior | 7.13, 7.15 / 49, 58 |

## Requirement coverage and limits

| Requirement | Current source evidence | Acceptance limit |
|---|---|---|
| 1. Dedicated admin UI / isolation | `entry.tsx`, `StudioPage`, feature store and thin `src/app/main.tsx` mount | Existing page renders; other routes were not fully exercised |
| 2. Inventory / drag placement | Runtime inventory definitions, native drag payload, Canvas ghost, numeric placement, shared placement rules | Full pointer/device interaction remains unverified |
| 3. Polygon booths | Polygon schema, free drawing, vertex editor, resize/transform helpers and new extrusion renderer | No automated geometry suite, per instruction |
| 4. Surface colors | Calibrated bounded interior median sampler, natural image sizes, explicit/fallback colors | Live upload/CORS/image replacement interaction remains unverified |
| 5. Object types | 22 inventory recipes; editable stair/tent/material/signage contracts | Amenities/person remain planning placeholders as specified |
| 6. Procedural rendering | Native R3F geometry/materials, demand Canvas, no external model loader | Later realism and measured performance remain deferred/unverified |
| 7. Floors / navigation | Floor forms, image lifecycle, per-floor history, connectors and existing Recast worker | Live media upload and all multi-floor interactions remain unverified |
| 8. Validation / recovery | Schemas, exact studio collision, legacy walls, structured errors, render/context recovery | Backend physical-consumer agreement is incomplete: task 49 |
| 9. Persistence | Existing clients, wire parser, metadata adapter, canonical records, serialized revisions/epochs | Backend unavailable; authenticated round trip unverified; physical-consumer integration incomplete |
| 10. Shortcuts | Reference preset/POI cursors and guarded command resolver with undo/redo early return | Full manual shortcut interaction acceptance remains unverified |
| 11. Inventory definitions | Runtime catalog schema, validated instance defaults/parameters, stable procedural identities | Live save/reload proof remains task 44 |
| 12. Existing conventions | shadcn/Zustand/Zod/R3F, existing clients/schema/navigation, isolated subtree | Feature build passes; root build has pre-existing missing Vite helper files |
| 13. Demo parity | P01-P23 mapped in tasks.md; viewer/details/HUD/tour/debug/authoring paths present | Implementation coverage is distinct from full interaction acceptance; P24/P25 remain declined |

## Remaining backend physical-consumer gap

`src/features/building/model/authored-instance-physical.ts` resolves catalog assets, then falls back
to an instance-dimensions box when the asset ID is unknown. A versioned procedural metadata envelope
is unknown to that resolver. `src/features/building/model/layout-readiness.ts` consumes these boxes
and canonical booth Rooms; the backend calls that shared readiness path before publication.

For example, an L-shaped booth leaves a free region inside its rectangular bounds. Studio placement
and its Recast input use the exact L polygon. A spawn or connector landing in the free region may
still be rejected by the backend's rectangular proxy. A residual calibration shear is also absent
from that consumer's ordinary scale/yaw fields. The existing visitor renderer does not decode the
recipe envelope either; the new studio preview does.

This audit does not modify the backend/shared wire schema, disable collision, replace Recast or
silently mark the task complete. Task 49 requires the future physical-consumer/payload integration
to resolve this mismatch. Task 44 also needs a successful authenticated save/publish/reload. The
criteria remain in the restored specifications.

## Non-test verification evidence

- `node node_modules/typescript/bin/tsc -p src/floor-plan-builder/tsconfig.json`: passed.
- `oxlint src/floor-plan-builder`: passed with zero warnings/errors after corrections.
- `oxfmt --check src/floor-plan-builder`: passed across 31 files.
- Standalone Vite production build: passed; generated the ES navigation worker and Recast companion
  bundle. Large Three/Recast chunk warning remains; no measured FPS or latency claim is made.
- Read-only inspection of the existing in-app page at `/admin/floor-plan?eventId=floor-plan-studio`:
  Canvas and inventory/counts rendered; captured browser warning/error log was empty. Existing
  load-error and recovery-draft notices remain visible. No reload, recovery restore/discard or
  publication was performed during inspection.
- Read-only published-layout request to `127.0.0.1:8000`: connection refused. No authenticated
  backend round trip, image upload or publication is claimed.
- The root build remains limited by absent `scripts/vite/asset-revisions.ts`,
  `scripts/assets/archive-runtime-guard.ts` and `scripts/vite/mall-blueprint-cache.ts`, as previously
  recorded. No no-op replacements were introduced. Pre-existing server-route/editor-setting edits
  were left untouched by this work.
- No automated tests/test suites were authored or run. Tasks 28-42 remain deferred.

These checks establish compilability, bundling and the observed initial page state. They do not
establish full interaction parity, successful publication, accessibility compliance or performance.
