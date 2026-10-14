# Inventory preview implementation

The `/#inventory` page browses every identity returned by `getProceduralAssetIds` (14 base assets and 8 sized booths). Search and selection keep one Canvas and one active preview. Selecting a new asset borrows the existing shared recipe and compiled-geometry caches; the page retains the viewer cache owner and releases it on unmount.

All previews use `LoadedBatch`, so their graphics tier and optional lightweight recipe remain local to this page. The preview does not modify the venue, avatar, reservation state, or global low-quality toggle. It does not create a Rapier world because no collider or animated physics body is mounted here.

`LightingRig` accepts an optional framing override. The main venue path remains unchanged, and inventory uses the same environment, sun, hemisphere lighting, ACES exposure 0.8, sRGB output, and shadow implementation. Camera framing reads the generated scene bounds, including negative-Y floor tiles and portal rise. The displayed bounds and sockets are the physical catalog contracts; dimensions use the exact 0.3048 metre-per-foot conversion.

Graphics tiers control pixel density and shadow-map size. Lightweight variants are selectable only when a base catalog entry declares one. Sized booths use their full baseline recipe. The initial preview is balanced/full detail, and assets remain static unless the user orbits the camera.

TypeScript checking passed. No tests, browser comparison, or build was run for this slice. Archived Blender visual parity approval is still pending; a successful preview or matching dimensions does not establish pixel-level visual equivalence.
