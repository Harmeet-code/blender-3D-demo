# Blender asset production and website placement plan

Status: asset production and website integration completed on 2026-10-02; designated integrated-GPU laptop acceptance and archive remain pending. Dimensions below are the initial project defaults. Budgets are normative in [the asset spec](specs/blender-asset-library/spec.md); the checklist is [tasks.md](tasks.md). Actual exported dimensions and production evidence are in `reports/assets/remaining-asset-production.md`; website scenario evidence is in `reports/assets/website-acceptance.md`.

Scheduling update, 2026-10-02: the user explicitly prioritized production of the remaining eight assets. Produce their sources, baseline/quality exports, metadata, and authoring previews now; complete browser placement and interaction acceptance later. This overrides the earlier first-slice browser gate as a production prerequisite.

Resume update: the user subsequently authorized the remaining website work after another agent added shadcn. That implementation is now present; the earlier scheduling deferral is historical.

## 1. Set up the asset workspace

1. Confirm Blender is installed, enable the MCP add-on, start its local bridge, and obtain scene information through Codex. MCP registration alone does not establish a live Blender connection.
2. Create source/export/preview folders from `design.md`. Record Blender/exporter versions and use meter units at scale 1.
3. Make a calibration scene with a 1 m cube, a floor reference at 0, a second reference at -4 m, and a front marker toward Blender -Y.
4. Save a material library: neutral panel, dark metal, wood, safety yellow, glass approximation, and default branding. Use a limited palette; flat materials do not need textures.
5. Author assets individually at a neutral root; keep lights, cameras, calibration objects, and construction geometry in non-export collections. Save `build.py` steps and `.blend` checkpoints with stable names so the MCP scene is not the sole copy of the work.

Gate: export the calibration scene and check browser meter scale, Y-up, +Z-facing, and root transforms. Fix the authoring/export preset before modeling the library.

## 2. Model the first booth, chair, and table

All dimensions are **width X × height Y × depth Z after export**. Blender dimension axes are X/Z/Y respectively. Bevel sizes are meters and are starting values; inspect triangle counts after modifiers and export.

| Order | Asset       | Default dimensions  | Anchor                    | Modeling recipe                                                                                                                                                   |
| ----- | ----------- | ------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | floor tile  | 4 × 0.2 × 4 m       | Top center                | Cube; set dimensions; lower its center so the top is the zero plane; keep edges simple; assign one floor material.                                                |
| 2     | wall panel  | 1 × 2.5 × 0.1 m     | Bottom center             | Cube panel; add a restrained 0.005 m bevel if visible; create compatible 2 m and 4 m assembly lengths using repeated sections; assign the shared panel finish.    |
| 3     | booth frame | 4 × 2.5 × 4 m       | Bottom center             | Arrange rear and side panel/frame members; keep the front open; make a separate upper branding rectangle; add entry and branding empties; leave ceiling separate. |
| 4     | chair       | 0.5 × 0.85 × 0.55 m | Feet plane, bottom center | Cube seat at 0.45 m; four box legs; thin backrest facing -Y; bevel visible edges by 0.005 m; join static pieces and assign one material.                          |
| 5     | table       | 1.2 × 0.75 × 0.6 m  | Feet plane, bottom center | Thin rectangular top; four legs/frame below; bevel the top by 0.005 m; join static geometry; use one finish and keep tabletop level.                              |

For each row:

1. Build the silhouette from boxes and a small number of low-sided cylinders only where required.
2. Measure the entire object envelope, including beveled edges. Set the root/anchor using the declared contact plane, then apply rotation and scale on static geometry.
3. Recalculate normals and inspect front/back faces. Remove duplicate internal faces without destroying disconnected structural parts. Keep source modifiers editable and export an evaluated copy.
4. Add footprint and collider metadata. A chair/table uses one simplified occupied box initially; the floor uses a slab whose top stays at zero.
5. Save source and export only the asset root/children. Validate and render front, side, top, and browser views.

Gate: load one booth with one chair and one table at F1 and B1. At scale 1, feet touch each floor, the 1 m calibration reference matches, both props fit without clipping, the front direction is correct, and two chairs can be rendered independently. Do this before the remaining objects.

## 3. Model display and storage objects

### Display case — 1.2 × 1.1 × 0.5 m

1. Model an opaque lower cabinet, thin top, and simple rectangular upper frame.
2. Add glass panels as a separate mesh/material slot; create an opaque low-quality alternative that retains the same silhouette.
3. Use texture or normal detail for handles instead of dense small geometry. Keep at most two material slots.
4. Set a bottom-center root, box collision envelope, footprint, and front interaction point; verify exported transparency and low-quality rendering in the browser.

### Safe — 0.6 × 0.8 × 0.6 m

1. Start with a beveled box body; inset the front door outline.
2. Use a low-sided handle or baked handle detail; no working interior or door animation in this release.
3. Join static geometry into one material group, set its bottom root, and record its box envelope.
4. Export and place against a booth rear zone; verify it leaves the interaction route clear.

### Pallet — 1.2 × 0.15 × 0.8 m

1. Build a few repeated deck boards, support blocks, and lower runners using linked duplicates.
2. Keep the visible gaps and remove unnecessary internal intersections; use one wood finish.
3. Apply/export duplicates to static geometry without creating a unique material for every plank.
4. Set its ground root and footprint. Preview it at a logistics anchor, preserving the purchased-service label.

Gate: each exported object passes its budget, contact-plane check, source version check, and small-room rejection scenario.

## 4. Model branding and logistics

### Banner stand — 1 × 2 × 0.3 m

1. Build a weighted base and two low-sided vertical supports.
2. Add a separate flat branding surface with a known UV rectangle; avoid overlapping front/back faces at identical depth.
3. Place `socket_branding` in exported root space and record the surface's width/height/normal.
4. Export a default-branded version. Verify a square and a wide logo letterbox correctly and only affect one instance.

### Forklift — 1.2 × 2.2 × 3 m including forks

1. Block out chassis/counterweight, cab opening, mast, and forks; make the silhouette readable at venue scale.
2. Add four low-sided wheels and a simple protective roof; use baked/scalar finishes for tiny details.
3. Limit materials to body, metal/rubber, and optional cab detail. Remove modeled interiors that cannot be seen.
4. Create a low-detail copy at no more than half the baseline triangles, retaining the same anchor and attachment interface.
5. Set the ground root and full footprint including protruding forks; verify a preview only appears at an explicit logistics anchor and never in the booth route.

Gate: logistics previews are clearly labeled; selecting a service with no anchor still keeps it in the cart.

## 5. Model portal assets

### Elevator entrance — 2 × 2.6 × 0.3 m

1. Build an outer frame, threshold, and two separate door panels.
2. Name `door_left` and `door_right` and put their local transforms at the closed positions; maintain a stable entry-root transform.
3. Add `portal_lower`/entry metadata and an approach marker; author a short door-open preview only for asset verification.
4. Create a simplified collider arrangement with an entrance opening and a low-detail variant.
5. Export and confirm door/socket names survive any optimization. Mount entrances at explicit entries on both F1 and B1; application code controls transit state.

### Stairs — 2 × 4 × 6 m between the reference floors

Production clarification: 4 m is the landing-to-landing rise and 6 m is the sloped flight's horizontal run. Two 1 m landings make the full exported depth 8 m. Rails and the landing thickness make the actual height approximately 5.155 m. Placement must use the measured metadata bounds and footprint, not the nominal flight dimensions. Landing-center sockets are `[0, 0, 0]` and `[0, 4, -7]` in exported root space.

1. Block out lower/upper landings and a 4 m rise across 6 m depth; divide the visual flight into a modest number of repeated steps.
2. Add simple rails with low-sided sections; keep the underside uncomplicated.
3. Place the root at the lower approach threshold; put `portal_lower` and `portal_upper` at the landing centers.
4. Record simplified ramp/landing collision metadata, not a collider per step; create a low-detail version with the same anchors.
5. Export and place the root at B1's -4 m so the upper anchor reaches F1's 0 m. Keep the reference preview outside the slab envelope; reject other floor rises with a diagnostic. Internal cutouts and working stair traversal require a separate layout/navigation change.

### Escalator entrance — 2 × 4 × 6 m reference portal representation

Production clarification: the escalator shares the stairs' 4 m rise, 6 m flight run, 8 m complete depth, and landing-center sockets. Its full height, including the continuous handrails, is approximately 5.150274 m. Both portals use their lower entry plane as the anchor; a landing slab may extend below that plane.

1. Build a static incline/step silhouette with entry and exit landings plus simple side panels.
2. Add low-sided rails and a neutral belt appearance; omit mechanical interiors and animated individual steps.
3. Set lower-entry and upper-route anchors to match the reference 4 m rise; declare it as a visual portal representation.
4. Export a low-detail counterpart and verify matching anchors. Application transit behavior is independent of visual geometry.

Gate: portal graph IDs remain unchanged; missing per-floor entry positions produce a diagnostic. Visual portal previews do not certify a physically traversable building.

## 6. Finish materials and export releases

1. Inspect materials in the website's shared reference lighting, using a predictable neutral environment and exposure. Match appearances in that lighting, not a cinematic Blender render.
2. Keep simple surfaces as scalar PBR materials. For textured finishes, create clean UVs and bake required base color/normal/occlusion data. When re-unwrapping an imported model, rebake its original appearance; do not discard working UVs merely to obtain a uniform atlas.
3. Use exporter-compatible material wiring; check channel packing and color-space assignments. Avoid applying both a baked shadow-colored finish and the same strong live shadow over it.
4. Export each GLB with selected asset hierarchy, materials, declared sockets, and necessary animations only. Exclude preview cameras/lights and construction data.
5. Validate GLB structure, exported triangle/material/texture counts, byte size, root transform, bounds, sockets, proxies, and version. Inspect actual exported vertex splits from seams/hard normals.
6. Optimize a copy only after the plain export passes. Preserve the asset interface and benchmark required decoders before accepting compression.
7. Publish matching metadata and previews with the asset version; keep failed exports outside the released catalog.

Gate: the complete kit has a release report and browser previews; no missing textures or silent node changes.

## 7. Put the objects into the website

1. Add the universal asset zod contract and static catalog metadata. Add explicit mapping from existing add-on IDs to physical/branding/logistics previews.
2. Add optional floor calibration, room entrances/booth asset references, logistics anchors, and per-floor portal entries to the shared building contract and DTO fixtures. Normalize coordinates once and preserve uncalibrated meter layouts and imported off-grid boundaries.
3. Import GLBs through literal Vite `?url` imports and add a reusable asset loader with Canvas geometry placeholders, DOM loading/error text, and retry.
4. Add a development preview scene to check one asset at a time next to the meter reference; test base-path production delivery.
5. Replace booth boxes in `FloorStack` with polygon-aligned surfaces and modular booth assemblies. Reuse the canonical frame on 4 by 4 m rooms; assemble compatible modules for the existing 10 by 8 room and concave fixtures.
6. Compute a deterministic prop placement list from the room polygon and cart selections. Apply containment, overlap, grid, and entrance-route checks before rendering.
7. Feed that list into the prop renderer, picking proxies, and Rapier colliders. Keep floor height on the parent and ground-contact prop Y at zero; disable inactive-floor picking and bodies.
8. Connect `BoothDrawer` selections to chair/table/case/safe visibility, branding surfaces, and service-preview messages. A failed fit or asset request retains the cart item.
9. Group compatible repeated primitives into per-floor instances after the first slice works. Keep instance-to-booth IDs stable and unique logos outside shared immutable materials.
10. Add bounded cache ownership and low-quality mode, then profile the reference fixture. Enable the asset kit by default after acceptance; retain geometry fallbacks for rollback and failures.

Gate: click a booth, add/remove chair and table, change a logo, select a nonvisual service, switch floors, and enter/exit dollhouse. Positions, selection identities, and cart state remain correct.

## 8. Verify and release

1. Run structural GLB validation and all asset-interface/budget checks.
2. Run shared-contract and placement tests for rectangles, concavity, rotations, image calibration, invalid inputs, insufficient space, logistics, and portal compatibility.
3. Run browser checks for independent instances, failure/retry, branding isolation, inactive-floor physics/picking, and production asset URLs.
4. Measure the two-floor stress fixture and the reference-device tour specified in `web-asset-delivery`. Record bytes, decoded textures, triangles, draw calls per pass, frame times, and resource counts after repeated floor switches.
5. Run `bunx tsc --noEmit`, `bunx oxlint`, `bunx oxfmt --check`, `bun test`, and `bun run build`; fix failures caused by this change and report pre-existing failures separately.
6. Save acceptance evidence and release the versioned catalog. Archive the OpenSpec change only when the implementation checklist is complete.

The first delivery milestone is the working booth/chair/table slice. The second is the validated complete kit. The third is website placement and interaction. The final milestone is measured release acceptance; performance work begins with measured bottlenecks at each earlier gate as well.
