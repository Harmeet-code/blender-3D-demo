# V2 assets and V3 venue-kit review

Review date: 2026-10-13

## Scope and evidence

Reviewed the checked-in execution notes, the source of the 25 expansion recipes and metadata, the generic procedural catalog dispatch, authored-instance physical metadata lookup, sized-booth provider, venue-kit presets and composer, booth physical contract, and the floor-stack rendering path. CodeGraph was queried before source inspection. The repo already contains unrelated user and agent edits; this review did not reset files, remove assets, or commit changes.

The expansion catalog contains 22 existing asset identities plus 25 V2 identities. The source metadata is parsed by `assetMetadataSchema`, and the procedural provider combines catalog metadata with recipes. Ground-contact metadata uses metres and +Z orientation. Thin surface colliders and passage openings remain represented by compound collider pieces. This review did not rerun the V2 geometry generator, inventory report, or broad tests; the earlier execution document records those outcomes, but they are not claimed here as newly verified.

The current source checkout does not contain the three referenced legacy paths `assets-source/procedural/info-desk.blend`, `road-segment.blend`, or `food-kiosk.blend`. The corresponding recipe output is procedural; those `source.blend` metadata paths are provenance references, not confirmed deliverable source files.

## V3 composer changes

`composeKitLayout(kitId, counts?)` now accepts exact per-asset quantity overrides. Omitted values use kit defaults; zero disables an item. Values outside integer 0–100 and keys not present in the selected kit throw explicit errors. The composer consumes each requested quantity once, keeps deterministic IDs scoped to kit and asset, and uses bounded placement grids. Unplaced valid items are distributed to remaining safe slots; if no safe slot exists the composer reports the asset and unplaced count instead of silently capping output.

Selected sized booth variants are represented by rooms with exact metre polygons, exact feet metadata, and `boothAssetRef` identities. Booth rooms are not also emitted as floor instances. A valid sized-booth asset reference plus matching footprint now selects the existing procedural booth model provider without storing a legacy `boothModelUrl`; the old URL-based path remains compatible. Sized booth ceilings derive from the shared physical height contract.

`venueKitCountSummary` reports requested, emitted instance, and emitted room quantities separately. It does not claim that every requested piece is manually placed in a final architectural layout: generic spare items may use automatically selected bounded grid slots for drag tuning. Slab coverage, entrances, occupancy, clearances after later edits, and readiness still require the editor/readiness checks.

The six presets remain starter pick-lists. Hospital and sports descriptions now state that clinical equipment/rooms and sport-specific courts/seating are not included. The ramp remains visual-only and floor-locked; no slope traversal or accessibility compliance is claimed.

## Verification and limits

A local `tsc --noEmit -p tsconfig.json` attempt reported the existing `src/api/api-result.ts:49` AxiosResponse type error. The backend agent owns that file. No broad test suite or asset generation pass was run here; the parent task will run its final compiler and readiness probes once after parallel edits settle.

This review establishes source-level contracts and confirmed changes only. It does not certify the visual output in Blender/browser, structural/code compliance, route accessibility, map calibration, persistence round-trips for every database adapter, or publish readiness for user-edited counts. The V2 source metadata, recipes, and physical-provider integrations were inspected, but the earlier report's generation metrics were not independently regenerated in this review.
