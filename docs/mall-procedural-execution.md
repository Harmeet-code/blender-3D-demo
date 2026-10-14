# Original mall: native R3F implementation

The mall at `/view/default-event#/mall` constructs native Three.js geometry under
React Three Fiber. Application rendering has no GLB, glTF loader or Draco
dependency for this scene. The original Blender checkpoint and GLB reference
remain intact; no source or reference assets were deleted.

## Representation and coverage

- Source: `assets-source/scenes/atrium/backups/luminary-galleria-before-floorplans.blend`.
- Source SHA-256: `92bcbf50fea02f656e328314521940ff1799810d3ebe68dc14596ba0b5ad7a5f`.
- All 11,259 geometry objects: 10,655 meshes, 382 curves, 222 font objects.
- 1,179 shared geometry descriptions, 86 original web materials, 3,274,530 triangles.
- Exact flat boxes use `BoxGeometry`; 1,148 custom descriptions construct
  `BufferGeometry`. These preserve evaluated bevels, normals, UVs, curves,
  vehicle silhouettes and original glyph outlines. This is not a fully
  parameterized architectural editor: arbitrary custom topology remains
  source-derived geometry data, rather than being replaced with generic boxes.
- Every original object retains its ID, transform, material slots, category,
  cell and bounds. Blender coordinates map to `(x,z,-y)`, a proper rotation.
- Four retail floors, parking, vehicles, six cameras, view visibility, daylight
  and twilight controls retain the existing web scene's behavior.

Implementation lives in `src/features/mall/`. `MallPage.tsx` imports the native
component and camera/light metadata directly. The source material snapshot is
JSON: later regeneration does not require reading the old GLB.

## Loading, caching and resource ownership

`mall-manifest.json` points to a SHA-named `.json.gz` blueprint in
`public/mall-assets/`. The current download is approximately 16.3 MB. The loader
decompresses and verifies the complete SHA before constructing geometry. Packed
float/index buffers avoid parsing millions of JSON numbers. The first pass
did produce an unused uncompressed reference blueprint; it is retained and is
not requested by the app.

Valid hashed files receive immutable one-year caching through the Vite plugin
and supplied nginx configuration; missing hashes return 404/no-store. New
geometry receives a new URL. Manifest changes trigger a development reload.
Explicit error retry reloads the asset without requiring manual cache deletion.
The manifest arrives through Vite's versioned application chunks. Deploy the
new asset before or with the corresponding app build, and preserve previous
hashes while old clients remain active.

Non-suspending load owners and committed render owners protect shared geometry
while React prepares a scene. Unmount releases both owners; unused resources
retire and dispose once safe. Stale asynchronous builds cannot commit disposed
geometry. Packed payload fields are released after geometry construction.

## Rendering cost and limits

The current batch plan has 29 instance draws and 551 static material/cell draws:
580 base draw calls, matching the original GLB export. It instances 532 source
objects and uses indexed static merges for the rest. Spatial/category batches
retain view filtering and useful culling bounds.

The runtime probe reports 129,977,716 bytes of owned geometry arrays. That is
not total GPU or browser memory: shadow targets, transmission passes, decoded
payload peaks and driver allocations add cost. Removing a GLB does not itself
make a scene cheaper to render. The exact source geometry is retained, so this
change does not claim reduced-detail geometry for integrated GPUs or a universal
frame-rate improvement. Existing graphics controls and demand rendering remain.

The material target is the previous web scene. Blender shader nodes omitted by
the original glTF export were not present in that web scene either. Browser
lighting is preserved; pixel-identical Cycles output is not claimed.

One localized shadow correction keeps the ramp's 14 mm satin coating receiving
shadows while the underlying concrete casts them. The coating's own caster pass
created curved self-shadow acne. At the aligned exterior camera, excluding that
single overlay reduced mean RGB difference from 2.406 to 0.048 on the 0–255
scale, without changing topology, material factors or global lighting.

## Evidence and reproduction

Final production TypeScript/Vite build passed (17.09 seconds), lint passed with
existing nonblocking warnings, and the focused coverage/runtime checks passed.
Vite still reports large Three/physics vendor chunks. No broad test suite was
run, following the user's request to prioritize implementation speed.

- `reports/assets/mall-procedural-validation.json`: complete object coverage,
  valid material/index/group data, source bounds within 5 mm, zero errors.
- `reports/assets/mall-runtime-metrics.json`: exact rendered triangle count,
  buffer estimates and 580 base draws, zero errors.
- `reports/performance/mall-comparison.json`: six original/native camera pairs
  at identical 432 × 306 drawing-buffer dimensions; zero page/context errors,
  only the native hashed blueprint requested by the native fixture.
- `reports/performance/mall-comparison-montage.png`: original at left, R3F at
  right; rows are exterior, atrium, parking, SUV, pickup and arrival.
- `reports/performance/mall-pixel-comparison.json`: numerical screenshot
  differences. Captures are low-resolution software-renderer checks, not
  high-resolution visual certification or hardware FPS measurements.
- Final six-camera mean RGB differences range from 0.031 to 0.298 on the 0–255
  scale at that capture resolution. This supports a close match to the original
  web export, not a guarantee of pixel identity from every possible camera.
- `reports/performance/mall-app-capture.json`: actual application integration,
  lighting/view changes and route leave/reentry evidence: zero page errors,
  zero GLB/glTF/Draco requests.
- `reports/assets/mall-procedural-export.json`: standalone regeneration passed
  with the source unchanged. `mall-regeneration-equivalence.json` confirms the
  regenerated scene matches the captured scene after normalizing JSON signed
  zero; geometry buffer strings match exactly.
- `reports/performance/mall-production-probe.json`: built `/floorplan/` route
  loads without GLB/Draco, valid blueprint returns 200/application-gzip with
  immutable caching, missing hash returns 404/no-store. Preview now uses the
  build's deployment prefix; the cache middleware streams files directly so
  later Vite static handlers cannot overwrite those headers.

Run `bun run assets:validate:mall` and `bun run assets:report:mall` for focused
source/runtime checks. Regenerate with background Blender:

```powershell
& .cache/blender/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python scripts/assets/export-mall-procedural.py
```

The exporter reads the checkpoint, evaluates geometry and verifies its source
hash without saving the checkpoint. A deliberately changed checkpoint requires
an explicit provenance/material audit before updating the pinned hash.

The historical GLB appears only in the private comparison fixture and retained
reference/compatibility tools. Custom uploads and other routes keep their own
existing asset contracts; this mall cutover does not silently disable them.
