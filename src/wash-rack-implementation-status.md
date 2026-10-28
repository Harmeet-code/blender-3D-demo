# Wash Rack Implementation Status

## Implemented

- `wash-rack` keeps its existing recipe ID. New placements default to the livestock variant at 3.6 by 2.6 by 5 m and are collidable.
- Equestrian and equipment bays use their specified variant dimensions. Variant, wetness, running state, and bounded boom angle/arc live on each plan object.
- Variantless saved racks remain legacy records. Loading and saving preserves their dimensions and placement; choosing a variant explicitly converts them. A manual resize survives variant changes until the user resets dimensions.
- The existing recipe codec stores all plan-object fields. Saved placement data remains authoritative for position, rotation, scale, dimensions, and collision. Duplication follows the existing per-instance object path.
- The inspector edits the shared draft and exposes variant, water state, wetness, boom controls, and a variant-dimension reset.
- Wash-rack placement snapping is integrated into pointer preview, move, and placement paths. Rack-local geometry uses the wash-rack origin adapter; legacy records keep the old center-anchored footprint until conversion.
- Rendering includes variant structures, authored signs and gear, wet-floor shading, and water effects with distance-based effect quality. Routing consumes the rack's physical barriers and approach/interior geometry rather than a solid rack rectangle; compatible row connections drive seam ownership and shared utility rendering.

## Verification

- `npm run build` passed against the final frozen sources: floor-plan-builder TypeScript build, Vite production bundle, and Bun server bundle. Vite reported large chunks: StudioPage (~1.83 MB), WalkthroughSensors (~2.26 MB), and the navigation compatibility chunk (~726 KB).
- Scoped `oxlint`, formatting, and type checks passed for the final renderer source.
- Manual preview captures cover all three variants, a connected row, dry/wet states, and active vehicle water. The approved running-water capture is `.local/wash-rack-final-water-running.png`. In the vehicle-water query preset, with water running and the camera 6.29 m from the FX anchor, the 32-bit water seed/hash fix produces a visible directional stream from wand to impact and a floor splash. The browser reported no console errors; the parent visually approved the variants, row, signs, gear, and water presentation.
- Automated test suites were not run, as requested. No 20-rack performance claim is made.

## Deferred follow-up

- Resume the shipping-bay redesign tomorrow. The approved dock-bay target is about 5.0 m overall height, with a 1.2 m platform and a 3.2 m clear opening. No shipping-bay implementation is included in this wash-rack change.

## Visual implementation notes

- The near-field water effect uses about 800 instanced droplets updated per frame; the hose motion uses a 12-segment Verlet approximation.
- Structural geometry is not distance-scaled. The distance policy applies to water effects.
