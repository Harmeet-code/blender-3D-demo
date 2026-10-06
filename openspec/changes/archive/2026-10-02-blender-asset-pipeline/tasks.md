> Change class: **L**. Review verdict: APPROVED for the plan. On 2026-10-02 the user resumed website implementation after the eight assets and shadcn integration. Implementation and desktop acceptance checks are complete; the designated integrated-GPU laptop gate and archive remain pending. See `reports/assets/website-acceptance.md` for scenario evidence and limitations.
> Follow [asset-production-plan.md](asset-production-plan.md) for per-object recipes and [design.md](design.md) for architecture. Complete each gate before the next production stage.

## 1. Establish the working environment

- [x] 1.1 Confirm the Blender executable/version, enable the MCP add-on, start its local bridge, and obtain scene information from Codex; save connection evidence without altering an existing user scene.
- [x] 1.2 Create authoring/export/preview/report directories and record source-license conventions; verify `.blend` sources cannot enter the frontend build asset graph.
- [x] 1.3 Build the meter/front-direction calibration scene and save the shared material library; verify scene dimensions and material names in Blender.
- [ ] 1.4 Record the integrated-GPU reference device, browser, viewport, quality settings, and tour protocol specified in web-asset-delivery; save a repeatable benchmark description.
- [x] 1.5 Run the current project gates and record baseline failures before implementation; preserve unrelated working-tree edits.

## 2. Define asset and layout contracts

- [x] 2.1 Add the shared zod asset metadata contract with anchor, bounds, footprint, material roles, socket transforms, collider half-extents, versions, licenses, and budgets; add valid/invalid contract fixtures.
- [x] 2.2 Add optional floor coordinate calibration and a typed single normalization boundary; test 400 px at 0.01 m/px, legacy 10 by 8 meter rooms, and rejection of nonpositive/non-finite calibration.
- [x] 2.3 Add optional room entrance/booth asset reference, logistics anchors, and per-floor portal entries to the shared building contract; verify old fixtures/DTOs and floor graph output remain compatible.
- [x] 2.4 Add geometric and referential validation for finite values, duplicate IDs, unknown floor references, self-intersecting/zero-area polygons, and invalid anchors; verify coded errors preserve the last valid layout.
- [x] 2.5 Define explicit visual mappings for every existing add-on ID; test physical props, branding, logistics previews, and nonvisual services without changing reservation payloads.

## 3. Build export and validation tooling

- [x] 3.1 Pin glTF inspection/validation development tools through bun and create typed Result-based asset script entry points; verify deterministic tool versions and coded CLI failures.
- [x] 3.2 Create the Blender export preset/recipe and metadata extraction for selected asset roots; export the calibration scene and validate loaded Y-up, +Z-facing, unit root scale, and dimensions.
- [x] 3.3 Add actual-GLB checks for primitive triangles, material slots, bytes, texture dimensions, root bounds/anchor, required nodes, and version consistency; verify oversized-chair and missing-socket fixtures fail.
- [x] 3.4 Generate per-asset validation reports and front/side/top preview images from a repeatable scene; verify source/export/license links and collision-only geometry exclusion.

## 4. Model the first production slice

- [x] 4.1 Model/save/export the 4 by 4 floor tile with its top-surface root; pass the 100-triangle/one-material budget and contact-plane check.
- [x] 4.2 Model/save/export the wall panel and reusable assembly lengths; pass the 200-triangle/one-material budget and matching-thickness checks.
- [x] 4.3 Model/save/export the open-front 4 by 4 booth frame with entry/branding sockets and separate optional ceiling; pass the 2,000-triangle/two-material budget and required-node checks.
- [x] 4.4 Model/save/export the chair from the production recipe; pass the 800-triangle/one-material budget, meter dimensions, front-direction, and feet-plane checks.
- [x] 4.5 Model/save/export the table from the production recipe; pass the 500-triangle/one-material budget and tabletop/feet-plane checks.

## 5. Prove Blender assets inside the website

- [x] 5.1 Add the catalog's frontend URL resolver with literal Vite asset imports and a development preview scene; verify each first-slice GLB loads and unknown references produce a labeled fallback.
- [x] 5.2 Add isolated loading/error/retry boundaries with Canvas geometry fallbacks and accessible DOM status; verify HTTP and decode failure/retry preserve camera, selection, and cart.
- [x] 5.3 Render two independent chair hierarchies sharing immutable resources; verify both appear, have independent transforms, and deleting one leaves the other intact.
- [x] 5.4 Assemble one booth with chair/table on F1 and B1; save browser evidence of contact within 0.005 m, dimensions within 1%, correct facing, and no duplicate floor offset.
- [x] 5.5 Build and preview under `/expo/`; verify every first-slice asset request resolves from production URLs. All 19 catalog releases loaded below `/expo/`; final production tour evidence is recorded.

## 6. Model remaining furniture, branding, and logistics

- [x] 6.1 Model/save/export the display case and opaque low-quality glass alternative; pass the 1,500-triangle/two-material budget and matching-envelope checks. Browser appearance evidence is recorded in 6.6.
- [x] 6.2 Model/save/export the safe; pass the 1,000-triangle/one-material budget and ground-contact/interaction-envelope check.
- [x] 6.3 Model/save/export the pallet; pass the 500-triangle/one-material budget and full-board footprint check.
- [x] 6.4 Model/save/export the banner stand with a stable UV-mapped branding surface/socket; pass the 500-triangle/two-material budget and authoring previews. Browser logo evidence is recorded in 6.7.
- [x] 6.5 Block out and finish the forklift body, mast, forks, and wheels; save/export baseline and low-detail releases, pass the 6,000-triangle/three-material budget, and verify the low-detail count is at most half the baseline.
- [x] 6.6 Verify the display case's transparent baseline and opaque alternative in the website's reference lighting and low-quality mode, including oblique views and overlapping objects.
- [x] 6.7 Replace the banner's default branding with square and wide logos in the browser; verify aspect preservation, stable surface attachment, and isolation between instances.

Production evidence for 6.1–6.5 and 7.1–7.3: `reports/assets/remaining-asset-production.md`, `catalog-validation.json`, `source-validation.json`, and the native Blender previews.

## 7. Model portal representations

- [x] 7.1 Model/save/export the elevator entrance with separately named doors and stable entry anchor; validate its 3,000-triangle/three-material budget, low-detail counterpart, and door-open preview.
- [x] 7.2 Model/save/export the 4 m-rise stairs with lower/upper anchors and simplified ramp/landing proxies; validate its 2,000-triangle/two-material budget and compatible low-detail counterpart.
- [x] 7.3 Model/save/export the static escalator portal representation with matching entry/exit anchors; validate its 4,000-triangle/three-material budget and compatible low-detail counterpart.

## 8. Publish the complete validated kit

- [x] 8.1 Bake only required procedural finishes and correct export-compatible PBR/occlusion/normal data for each asset; verify browser finishes under reference lighting without missing textures.
- [x] 8.2 Run structural/interface/budget checks on every baseline and low-detail GLB and generate versioned metadata/previews; release only passing files and retain plain exports. All 19 baseline/quality exports passed, including the optional ceiling; frontend catalog is enabled.
- [x] 8.3 Compare optimization candidates for bytes, decoding cost, visual quality, names, and sockets; document the selected baseline and configure/deploy version-matched local decoders only if compressed assets are accepted.

## 9. Assemble calibrated rooms and floors

- [x] 9.1 Add editor calibration input, entrance markers, logistics anchors, and per-floor portal entry editing/export; verify DTO validation and visible diagnostics for missing/invalid positions.
- [x] 9.2 Replace bounding-box booth placeholders with full-polygon surfaces and canonical-frame/module assembly; test 4 by 4, existing 10 by 8, concave, rotated, and off-grid 4.3 m fixtures with entrance gaps.
- [x] 9.3 Add compatible portal visuals and explicit 4 m-rise validation, positioning full-flight previews outside the reference slabs; test missing entries and 3 m-rise rejection without changing `connects`.
- [x] 9.4 Apply floor transforms once and add normal/transition/dollhouse activation policies; verify saved heights restore and inactive floors expose no picking targets or active bodies.

## 10. Compute safe deterministic object placement

- [x] 10.1 Implement room-local placement records and stable 0.25 m candidate ordering using typed Results; test repeated toggles produce the same placement with identical inputs and no duplicates.
- [x] 10.2 Validate complete rotated footprints, concave boundary segment crossings, 0.05 m clearance, and blocking overlap; test rejection of candidates whose centers/corners fit but edges cross outside the room.
- [x] 10.3 Add conservative 1 m entrance-to-interaction clearance search; test blocked/narrow routes and a valid concave-route fixture without introducing full application NavMesh routing.
- [x] 10.4 Connect accepted records to asset rendering, picking proxies, and Rapier primitive colliders; verify matching transforms and no detailed automatic prop trimeshes.
- [x] 10.5 Handle no-fit props and missing logistics anchors as visible preview warnings; verify cart items remain selected and forklifts never spawn in booths/circulation paths.

## 11. Connect booth controls and branding

- [x] 11.1 Wire existing drawer selections to prop, branding, and service preview records; verify add/remove affects only the selected booth and nonvisual services spawn no object.
- [x] 11.2 Add logo type/byte/dimension validation and recovery, image resizing, and aspect-preserving branding attachment; test PNG/JPEG/WebP and invalid/oversized inputs.
- [x] 11.3 Isolate owned branding materials/textures and apply surface/normal offsets; verify two-booth isolation, oblique-camera stability, and cleanup after repeated logo replacement.
- [x] 11.4 Verify the existing reserve scenario and request fields remain compatible with preview state, including preview failure; report any pre-existing unwired reservation behavior separately.

## 12. Batch repeated assets and control resource use

- [x] 12.1 Batch static compatible primitives by asset version/material/LOD/floor while preserving local transforms; verify main-pass calls follow batch count and instances map to the correct booth IDs.
- [x] 12.2 Add common-kit and bounded floor-cache ownership with reference counts and safe eviction/disposal; verify removing one instance or floor cannot invalidate shared live resources.
- [x] 12.3 Add low-quality DPR/shadow/glass settings and compatible portal/forklift LODs; verify socket positions and selection identities do not change with quality.
- [x] 12.4 Create the two-floor/twenty-booth-per-floor stress fixture with contained props and designated portal/logistics locations; verify geometry and catalog versions are deterministic.
- [x] 12.5 Record transfer bytes, decoded texture/mipmap estimates, visible triangles, and draw calls per pass; adjust assets/batches until normal and low-quality spec limits pass.
- [x] 12.6 Run twenty floor switches, shared-instance removal, and repeated logo changes; verify resource counts stabilize and stale physics/picking objects are absent.

## 13. Complete acceptance and release

- [x] 13.1 Map every spec scenario to a unit/contract test or explicit Blender/browser acceptance check; save reports/screenshots and ensure no requirement is left without evidence.
- [ ] 13.2 Run the recorded-device 60-second low-quality camera tour after 10-second warm-up; achieve at least 30 average FPS and p95 frame time at most 33.3 ms, recording device/browser/settings.
- [x] 13.3 Run `bunx tsc --noEmit`, `bunx oxlint`, `bunx oxfmt --check`, `bun test`, and `bun run build`; fix change-related failures and document pre-existing failures with evidence.
- [x] 13.4 Enable the validated catalog by default and exercise rollback to the previous catalog/geometry fallback; verify layout IDs and cart state survive.
- [ ] 13.5 Re-run strict OpenSpec validation, check tasks off only with evidence, and archive the change only after implementation and acceptance are complete.

## Acceptance notes (2026-10-02)

Evidence is mapped in `reports/assets/website-acceptance.md`. Final gates: 43 tests pass, TypeScript/lint/build and 19-export validation pass. The GT 710 desktop tour is diagnostic; it cannot complete 1.4 or 13.2. Task 13.5 strict validation is run, but archival waits for laptop acceptance. Floor transitions are atomic, with no animated overlap. The editor export reports success; the automation did not expose the downloaded blob file. Reservation API contracts pass, while the existing frontend reservation wiring remains a separate roadmap item.
