> Change class: **L**. Proposed implementation; no Blender assets or runtime changes have been made by this change.

## Context

See [proposal.md](proposal.md) for motivation. CodeGraph inspection of the current working tree shows:

- `FloorStack.tsx` renders a 40 by 30 plane and booth boxes. Booth depth and center are hard-coded rather than derived from the complete polygon.
- `building-schema.ts` has F1 at 0 m and B1 at -4 m, a 10 by 8 demo room, optional single portal positions, and stable add-on IDs. Its coordinate comment currently allows pixels or meters without a conversion contract.
- `viewer-store.ts` stores cart selections as add-on IDs per booth; there are no object placement records.
- `BoothDrawer.tsx` changes cart state but does not render matching props. Reservation wiring is a separate outstanding task.
- `WorldCanvas.tsx` already provides R3F, drei, and Rapier; avatar movement and full navigation remain stubs.
- Assets belong under `src/frontend/assets`; the project uses inward feature-sliced imports, shared zod contracts, typed Results, and bun tooling.

## Goals / Non-Goals

**Goals:**

- Establish an asset interface that Blender, release tooling, and the website can validate independently.
- Prove a complete booth/chair/table slice before producing the remaining kit.
- Keep the existing booth IDs, add-on IDs, reservation payloads, and logical floor graph compatible.
- Derive rendering, picking, and collision from the same accepted placement data.

**Non-Goals:**

- Building a finished venue inside a single giant GLB or importing Blender's interaction logic into the browser.
- Implementing arbitrary drag-and-drop furniture editing, persistent per-item transforms, checkout, crowd steering, or a full navigation mesh in this change.
- Shipping all three venue templates suggested in the notes. One B1/F1 convention-center template establishes the modular kit; others can reuse it later.

## Decisions

### 1. Use a neutral modular venue kit and a tested spatial interface

Use a consistent contemporary exhibition style: soft bevels, neutral panels, dark metal, restrained blue accents, and replaceable branding. Initial dimensions and modeling order are in [asset-production-plan.md](asset-production-plan.md). They are project defaults, not claims about real venue safety standards.

Blender uses meter units with scale 1. Author X right, Z up, and directional asset fronts toward -Y. Export glTF with its Y-up conversion once so the website receives X right, Y up, +Z facing. Export a neutral root with unit scale and no corrective root rotation; bake axis conversion into the asset hierarchy as necessary and verify the loaded root instead of guessing a compensating React rotation. Floor-contact roots sit at the ground, floor-tile roots sit on their upper surface, and portal roots sit at their lower-entry threshold.

Preserve named sockets and moving parts through optimization. Standard names include `root`, `mesh_*`, `socket_branding`, `socket_entry`, `portal_lower`, `portal_upper`, `door_left`, and `door_right`. Only names declared in metadata are mandatory for each asset. Root-space metadata uses the exported coordinates. Record aggregate collision shapes in metadata; do not export hidden collider meshes as visible primitives.

Alternative: correcting every GLB with JSX rotations and scale factors is fast initially but makes every placement and collider dependent on undocumented exceptions.

### 2. Separate authoring, release metadata, and browser URLs

Proposed locations:

```text
assets-source/blender/<asset-id>/<asset-id>.blend
assets-source/blender/<asset-id>/build.py
assets-source/blender/materials/                 # shared source finishes
src/frontend/assets/models/<asset-id>.v1.glb
src/frontend/assets/images/asset-previews/<asset-id>.webp
src/frontend/assets/metadata/catalog.v1.json
src/frontend/entities/asset/model/asset-schema.ts
src/frontend/entities/asset/model/add-on-visuals.ts
src/frontend/entities/asset/ui/AssetModel.tsx
src/frontend/entities/asset/lib/                 # validation/resource ownership
src/frontend/widgets/world-viewport/            # assembly and batching
scripts/assets/                                # release checks and reports
```

Store sources and small release assets in the repository initially; declare a Git LFS/object-storage approach before sources grow substantially, and ensure CI obtains real binaries. No large-file transport dependency is needed for the first kit. Keep the authoring root separate from browser imports so `.blend` files cannot enter a Vite bundle.

The shared zod asset contract contains ID/version, anchor kind, dimensions `[width,height,depth]`, exported bounds, footprint polygon, facing axis, material roles, required nodes, attachment transforms, collision shapes, source/license, texture limits, triangle limits, and measured release metrics. Collision cuboids store half-extents and local transforms explicitly. Blender's export-side JSON is validated by this same contract; avoid hand-maintaining a second manifest.

Browser URL resolution is a separate frontend map using literal Vite `?url` imports. Do not put browser URLs or React imports in the universal asset schema; server code can import the schema without accessing binaries. An optional URL map can later redirect versioned assets to a CDN. No manifest is served over a new HTTP endpoint in this change, and no database migration is required for deterministic previews.

Alternative: string-built `/models/${id}.glb` paths are simple but bypass the project's imported-asset policy and break more easily under deployment base paths.

### 3. Calibrate image layouts at a single conversion boundary

Extend each floor with optional `coordinateSystem`: `{ units: 'meters' }` or `{ units: 'pixels', metersPerPixel, origin: [imageX,imageY] }`. Omitted metadata means meters for backward compatibility. Validate positive finite calibration and simple, nonzero-area polygons. Normalize all render/placement inputs once into meters:

```text
x = (imageX - originX) * metersPerPixel
z = (imageY - originY) * metersPerPixel
y = floor.heightOffset
```

Image Y-down deliberately maps to plan Z-positive. Apply the same calibration to room polygons, entrances, logistics anchors, and portal entries. Pixel values stay in the editor's source layout; downstream normalized meter data has a distinct type and cannot be normalized again. Floor height offsets always remain meters.

Add optional room entrance data, a `boothAssetRef` with ID/version, and explicit per-floor portal `entries` with `floorId`, position, and yaw. Add optional per-floor `logisticsAnchors`. Missing booth references resolve to the compatible standard kit; unknown references use the labeled polygon fallback. Preserve existing portal `connects` and optional `position`; legacy portals without explicit entries keep graph connectivity and show a placement diagnostic. Do not infer per-floor entries from a shared point across differently calibrated floor images. Validate referenced floor IDs, unique IDs, finite heights/yaws, and placement metadata along with calibration.

For rooms without entrances, deterministically use the midpoint of the longest boundary edge, tie-breaking by edge order, with an opening of at least 1 m where space permits. If that clearance cannot be achieved, flag the room as unsuitable for the standard kit. A room-local origin is its meter-space bounding-box minimum with yaw 0; rotated standard frames get an explicit transform within that frame. This origin need not lie inside a concave room.

Alternative: migrate all stored coordinates silently into meters. Rejected because image calibration has not yet been recorded and the wrong conversion would corrupt layouts.

### 4. Assemble room geometry and props from deterministic placement records

The canonical booth frame is 4 by 4 m. Use it only on matching rectangular footprints. For the current 10 by 8 demo booth and arbitrary simple polygons, construct floors from triangulated polygons and use repeated wall/panel segments with procedural end sections. Keep panel thickness and furniture scale constant; do not stretch a complete booth GLB. New structural origins snap to 1 m, while imported calibrated polygon vertices remain untouched. Leave the entrance gap and represent ceiling panels separately so they can be hidden for overview cameras.

Compute placements from room geometry and selected IDs as a pure function returning a typed Result with a placement list and recoverable item warnings. A record holds `placementId`, booth/floor ID, asset ID/version, room-local X/Z, yaw, and optional branding data. Apply `world = floorTransform * roomTransform * assetTransform` once; dollhouse offsets affect only presentation parents. Store selection IDs in the existing cart; previews do not require a new server persistence contract.

Use a stable catalog order and ordered candidate zones (rear/perimeter before center) on a 0.25 m grid. Check the full transformed footprint, including segment crossings against concave boundaries, at 0.05 m clearance. Reject overlap with accepted blocking props. Validate an entrance-to-interaction route with a conservative 0.25 m grid search: a 0.5 m radius clearance envelope must fit at each cell and along each connecting segment. This limited 2D clearance check serves placement only; it does not replace the application's later multi-floor navigation work. If a candidate fails, try the next; if all fail, retain the cart item and show a warning.

Rendering, picking proxies, and Rapier colliders consume the same accepted records. Map instance IDs back to placement IDs. Inactive floors have neither pick targets nor active rigid bodies. Runtime collider proxies include fixed floor cuboids, wall cuboids, prop boxes, and simplified stair ramps; no automatic detailed trimesh collider for every prop.

Alternative: use a polygon's bounding box for all placement. Rejected because an object can overlap a concave cutout even when its center and four corners pass a naive check.

### 5. Map add-ons by meaning rather than by mesh existence

| Existing ID                                                         | Preview behavior                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `chair`, `table`, `display-case`                                    | Contained prop placement                                       |
| `safe-service`                                                      | Safe preview when room space permits; service purchase remains |
| `logo-banner`                                                       | Existing booth branding socket; optional stand at a valid edge |
| `forklift-service`, `pallet-service`                                | Labeled logistics-area preview only when an anchor exists      |
| `early-setup`, `early-delivery`, `exhibitor-parking`, `visa-letter` | Cart/UI selection, no mesh                                     |

Use an explicit visual mapping without relying on the current `kind` values, which classify forklift/pallet as `prop`. Preserve all IDs and reservation fields. A missing logistics anchor is a preview warning, not a purchase failure. Doors and stairs are authored visual interfaces; transit state and routing stay in application code. The first stairs/escalator variant has a 4 m rise; reject incompatible connections with a diagnostic instead of scaling it vertically. Other rises require separately authored compatible variants in a later release. Keep full-flight portal preview geometry outside the reference floor-slab envelope so this delivery does not need slab cutouts or claim working stair traversal.

For logos, accept PNG/JPEG/WebP up to 2 MiB and 2048 by 2048 pixels, decode with a recoverable error, and resize the runtime texture to at most 1024 by 1024. Fit within the branding rectangle with letterboxing. Use a dedicated branding surface offset by 0.003 m along its normal and material polygon offset where needed; inspect oblique camera angles. Clone only the instance-specific branding material, keep default materials shared, and dispose replaced owned logo textures. A remotely supplied logo must follow the application's permitted URL/CORS policy; no unrestricted arbitrary fetch proxy is introduced.

### 6. Prove uncompressed delivery before choosing compression

Start with self-contained GLB exports and PNG/JPEG textures using core glTF metallic/roughness materials. Use texture-free scalar finishes where possible; bake procedural detail only when visible at normal viewing distance. Ambient occlusion belongs in the supported glTF occlusion channel, not an assumption that Blender lightmaps automatically become browser illumination. Keep dynamic lighting separate from any baked finish.

Baseline exports must already pass budgets. Inspect/validate them with pinned glTF tools and the glTF Validator, then compare lossless/quantization or Meshopt options on a copy. Compression is enabled only after comparing bytes, decode time, visual quality, and preserved node interfaces with the installed Three/drei versions. Any required decoder/transcoder is version-matched, deployed locally, and tested in production; the plain baseline remains available for diagnosis. KTX2 is a later measured option when decoded texture memory is a bottleneck. Draco reduces geometry transfer, not texture storage or render triangle count; no fixed percentage saving is promised.

Alternative: run a global Draco command on all files immediately. Rejected because small assets may gain little, decoder overhead is real, and name/hierarchy transformations can break sockets and repeated-part batching.

### 7. Share resources while keeping object identity independent

Use the installed drei loader with a Suspense loading boundary and an error boundary around each asset family, plus a retry that clears only the failed URL's loader state. The Canvas fallback is geometry; accessible progress/retry text lives in the surrounding DOM. Catch thrown loader/decode errors at this UI boundary and translate diagnostics to the project's closed typed error vocabulary.

For initial proof, create independent static object hierarchies sharing immutable geometries/materials; never mount the same cached scene object under two parents. After the proof passes, batch compatible repeated primitives by asset version, geometry/material, LOD, and floor. Preserve each primitive's source-local transform in its instance matrix. One multi-material GLB can require several batches; unique logos, transparency, and shadow passes add draw calls. Door parts with distinct motion remain separate.

Own the common kit for the viewer's lifetime; use reference-counted ownership for floor-specific resources and user logos. Hiding or unmounting a floor does not itself prove resources were released. Evict unused floor resources beyond the two-floor cache limit; clear corresponding loader entries only after all users release them, dispose owned geometry/material/texture resources, and account for image bitmap lifetime. Clean up the viewer's ownership on exit. Don't dispose shared materials on individual item removal.

Use active-floor grouping and camera frustum culling first. Small prop proxies avoid triangle-heavy picking. Add a BVH only if measured picking time still warrants a new dependency; it is not a blanket requirement for every GLB. Keep the animation loop while avatar/physics/portal animation runs; optional demand rendering for a paused editor needs explicit invalidation.

### 8. Treat performance as a reproducible release gate

Build a dedicated stress fixture: 40 by 30 m F1 and B1 surfaces; twenty 4 by 4 booths per floor; one chair, table, and display case in each. Place portals and designated logistics anchors outside booth circulation paths. Report the limits in `web-asset-delivery/spec.md` rather than treating them as theoretical claims.

Low quality uses DPR 1, no dynamic shadows, an opaque display-case glass substitute, and shared small materials/textures. Standard quality permits one bounded shadow-casting light for selected large objects; tiny props do not cast dynamic shadows. Forklift and portal low-detail versions share the same root/socket interface and use at most half the baseline triangles; common props already meet small budgets and initially reuse their baseline geometry.

Estimate decoded texture bytes from dimensions, channel format, and mip levels, not GLB file size. Measure render calls per pass; renderer counters require a defined reset point when multiple passes run. Record the integrated-GPU reference device before implementation benchmarking; use the defined scripted tour and report results without claiming universal 60 FPS. Repeat twenty floor switches and an add/remove/logo-replacement cycle to catch resource leaks.

## Risks / Trade-offs

- [Blender MCP registration is present but a live add-on connection is unconfirmed] → first task checks scene inspection; keep executable `bpy` recipes and saved source files reproducible if interactive MCP is unavailable.
- [Axis conversion or export optimization changes root transforms] → test loaded GLB bounds, front marker, and socket positions before producing more assets.
- [Concave placement tests disagree with collision] → use one normalized footprint and placement record for all three consumers; fixture tests include edge crossings and rotations.
- [Large authoring binaries slow repository work] → keep the first kit small and document the transport choice before adding high-resolution source libraries.
- [Budget targets miss on the available laptop] → capture device details, profile actual bottlenecks, and simplify quality/assets until the release scenario passes.
- [Existing unrelated working-tree changes affect checks] → record failures and their ownership; do not rewrite unrelated files while implementing this proposal.

## Migration Plan

1. Introduce optional asset/calibration/entrance/portal-entry contracts and fixtures while preserving legacy meter layouts and cart IDs.
2. Produce and validate the floor/booth/chair/table slice, then integrate it in a development asset-preview mode with geometry fallbacks.
3. Release the remaining assets only after per-object checks; switch preview mappings gradually and retain the baseline GLBs.
4. Add batching, resource ownership, and measured reference-scene gates; enable the kit by default only after those gates pass.
5. Roll back through the previous compatible asset catalog or geometry fallback. Optional metadata remains readable; no destructive layout rewrite or reservation/database migration is required.

## Technical Sources and Corrections

- [Blender glTF material documentation](https://docs.blender.org/manual/ka/5.0/addons/import_export/scene_gltf2.html): compatible PBR channels, supported normal data, and authored occlusion need exporter-compatible materials.
- [R3F resource reuse and instancing](https://github.com/pmndrs/react-three-fiber/blob/master/docs/advanced/scaling-performance.mdx): URL-based loader caching and reused geometry/materials underpin repeated assets; batching and quality controls still require measurement.
- [drei useGLTF](https://drei.docs.pmnd.rs/loaders/gltf-use-gltf): cached loading/preloading and optional decoder configuration; preload only the common initial kit, then demand-load optional service assets.
- [Vite asset URLs](https://vite.dev/guide/assets.html): literal imported asset URLs participate in production URL rewriting and hashing.
- [Three GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html): required decoders must be configured for corresponding compressed formats, and image bitmap disposal needs explicit attention.

The supplied notes are useful concept input, not performance evidence. They do not establish Higgsfield's current 3D capabilities, fixed compression savings, guaranteed BVH speedups, or guaranteed GPU crowd performance. Smart UV projection can change seams and destroy an existing texture mapping unless rebaked; do not apply it blindly. Asset-origin contracts, material batches, decoded texture sizes, and shared-resource lifetime are the durable constraints to validate.
