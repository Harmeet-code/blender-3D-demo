# Modular booth plan — feasibility assessment

Saved on 2026-10-08. The original supplied proposal is preserved verbatim in [modular-booth-plan.md](modular-booth-plan.md). The assessment below reproduces the assistant's response. This documents the proposed approach; the arbitrary-size modular assembly system has not yet been implemented.

---

**Yes—the approach can work in your app, including your exact booth dimensions.** The proposal is sound, but its sample code and a few technical claims need correction.

I recommend a **hybrid booth system**: generate floors and plain wall spans from dimensions, then assemble detailed Blender posts, trim, lights, counters, and furniture around them. That preserves the visual quality without requiring a separate Blender file for every size.

Your app already has exact feet-to-metre conversion, asset instancing, and collision support. However, its refined booth renderer currently selects complete GLBs for predefined sizes; arbitrary modular booths would require an additional assembly system.

The important corrections are:

- **Preserve fractional lengths.** `Math.floor(width)` leaves gaps. A 10-foot booth is **3.048 m**, so three 1-metre panels leave **48 mm** uncovered. Use adjustable end panels or evenly sized spans.
- **Keep the entire structure inside the stated footprint.** Posts centred directly on the outer corners extend beyond it. Wall thickness and trim must be included in the dimension calculations.
- **Generate walls separately.** Extruding the whole footprint upward produces a solid volume unless holes are defined. Separate wall segments are simpler for rectangular booths and entrances.
- **Triplanar shaders are optional.** Metre-based UV coordinates can maintain consistent wood or carpet texture size. For movable booths, coordinates relative to the booth prevent textures appearing to slide across surfaces.
- **Distinguish transforms from geometry edits.** Ordinary object scaling works with Three.js raycasting through its world transform. Vertex edits require refreshed geometry bounds; changing instance matrices may require refreshed instance bounds. [Three.js geometry documentation](https://threejs.org/docs/pages/BufferGeometry.html), [instancing documentation](https://threejs.org/docs/pages/InstancedMesh.html).

The assembly must also update avatar collisions and navigation whenever dimensions change. A visually resized booth alone is insufficient.

> **For the chosen ones:** Store one authoritative booth specification—width, depth, height, entrance, and wall configuration—and derive its visual meshes, editor outline, colliders, and navigation obstacles from that same specification. This prevents subtle disagreements between what users see and where the avatar can walk.
