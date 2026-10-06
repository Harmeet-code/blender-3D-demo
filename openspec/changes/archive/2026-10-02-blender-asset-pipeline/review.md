> Change class: **L**. Pre-implementation self-review of the proposal, four spec deltas, design, and production plan. This is review of the plan; assets, browser behavior, and runtime performance have not been verified.

## Completeness

- [x] All four proposal capabilities have corresponding spec files; each requirement contains a WHEN/THEN scenario.
- [x] Asset errors, retry, unknown versions, insufficient room space, concave containment, invalid calibration, branding isolation, inactive-floor physics/picking, missing portal entries, and incompatible portal rises are addressed.
- [x] New capabilities use ADDED; the two existing spatial-world requirement names use complete MODIFIED blocks and preserve the reservation scenario.
- [x] All thirteen baseline assets have dimensions, modeling recipes, interface/budget checks, and an ordered production stage.
- [x] The booth/chair/table proof precedes completing the kit, preventing replication of an untested exporter/scale mistake.

## Correctness

- [x] Specs describe outputs and observable constraints; framework choices and algorithms remain in design and the production plan.
- [x] Budget limits are project targets with explicit units and reference conditions, not inherited performance claims from the notes.
- [x] Imported calibrated vertices remain intact; the 1 m snap applies to new structural origins. This resolves the initial conflict between grid snapping and exact polygon assembly.
- [x] Portal visuals are constrained to compatible rise/entry metadata. A 4 m staircase is not stretched to an arbitrary floor gap.
- [x] No false declaration that hiding a floor releases memory, that all models share one draw call, or that geometry compression removes texture memory.
- [x] No implementation completion is inferred from OpenSpec artifact completeness.

## Standards

- [x] Asset schema and visual mapping are entity concerns; viewport orchestration is a widget concern; booth controls remain a feature. Imports point inward.
- [x] Server/shared code can reuse asset and layout schemas without importing React, GLBs, or frontend URL maps.
- [x] Optional layout fields retain existing meter layouts, cart/add-on IDs, and reservation payloads. Existing DTO boundaries remain the single contract path.
- [x] Pure placement and release scripts use typed Results; loader exceptions are isolated by the documented UI error boundary.
- [x] No credentials or new arbitrary remote-fetch service are required. Any future URL/environment setting follows validated env conventions.
- [x] The implementation acceptance stage explicitly requires TypeScript, lint, formatting, tests, and production build checks. These are future checks, not claimed successful now.

## Risk

- [x] Source/export version drift is mitigated by checking actual GLB bounds, sockets, and metrics and retaining previous compatible releases.
- [x] Shared cached resources have an ownership policy; per-instance deletion cannot dispose other instances' geometry/materials.
- [x] Nonvisual services and logistics previews are separate; a missing preview does not discard a purchase selection.
- [x] Image calibration and per-floor portal entries avoid guessed positions that would distort stored layouts.
- [x] Reference portals remain visual interfaces; navigation, internal stair cutouts, and avatar movement are not implicitly promised by this asset work.
- [x] The durable spatial-interface decision is recorded in `adr.md` with Proposed status.

The live Blender bridge and the reference device are implementation setup checks. They do not prevent writing this plan or change its selected architecture; the release cannot be declared successful without their corresponding evidence. The current working tree contains unrelated changes, so implementation verification must identify failures from this change rather than silently altering unrelated work.

### Verification matrix for implementation

| Contract area                    | Required evidence                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| All asset interfaces and budgets | GLB Validator output, exported metrics, required-node and root/bounds checks, version/license metadata                       |
| Material and branding appearance | Front/side/top images and browser previews; two-instance logo isolation and oblique-angle check                              |
| Calibration and compatibility    | Unit/contract fixtures for meter and pixel layouts, invalid input, duplicate/dangling IDs, and portal entries                |
| Placement                        | Rectangle/concave/rotated footprint tests, edge-crossing rejection, route clearance, deterministic toggles, failure warnings |
| Loading and delivery             | Network/decode failure and retry, unknown version, independent instances, production `/expo/` asset delivery                 |
| Floors and physics               | F1/B1 placement, inactive picks/bodies, dollhouse restore, missing-entry and incompatible-rise diagnostics                   |
| Resource ownership               | Twenty switches; shared instance deletion; repeated logo replacement; stable resource counts                                 |
| Scene performance                | Defined stress fixture, transfer/texture/triangle/pass counters, named-device 60-second tour after warm-up                   |
| Project acceptance               | `bunx tsc --noEmit`, `bunx oxlint`, `bunx oxfmt --check`, `bun test`, `bun run build`                                        |

## Verdict

The revised artifacts resolve the placement, portal compatibility, and resource-lifetime concerns identified during this review. No unresolved architectural blocker remains before producing the implementation checklist.

VERDICT: APPROVED
