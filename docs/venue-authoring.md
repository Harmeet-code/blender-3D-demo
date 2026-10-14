# Venue authoring and procedural inventory

Run `bun run dev:all` and open http://127.0.0.1:5173/. The default event is `luminary-galleria`; `VITE_EVENT_ID` can select another event. Open **Admin builder → Annotate** to author the layout.

## Create and calibrate

Add a blank floor to start with a 40 × 30 m metric boundary and no image, copied placements or Blender shell. Alternatively upload PNG, JPEG or WebP: up to 50 MiB / 150 megapixels, retaining the original and using a preview capped at 4096 pixels. Each floor can use a different image.

Image upload/replacement marks calibration required. Use two known endpoints for uniform scale, three rectangle points for affine stretch/skew, or explicitly confirm a manually entered scale. Declared original image dimensions drive coordinates; preview dimensions do not silently change physical sizes. An origin adjustment does not confirm scale. Perspective/lens distortion must be rectified first; one booth reference cannot prove that an entire schematic map is uniformly to scale.

Until calibration is confirmed, placement, drawing, movement and resizing are gated. Existing elements can still be selected/deleted to recover a draft with incompatible old geometry. Draft saves remain available. Replacing/recalibrating a map discards its incompatible exported shell reference.

## Draw and furnish

Draw walls, edit thickness/height in meters, and add door/window openings. Opening offset is the center distance from wall start, not the left edge. Sill and lintel geometry is shared between visuals, collisions and navigation. Draw named walkable, blocked or display zones and add entry/exit/amenity/information/custom POIs. Boundaries, obstacles and avatar starts are explicit geometry; raster colors and labels are not auto-traced.

Place built-in inventory using the palette/drag-drop workflow. Select, drag, rotate, resize or duplicate assets/booths. Gestures commit at the end, snap to 0.1 m unless Shift is held and cancel with Escape. The built-in inventory uses procedural Three.js geometry rendered by R3F: 14 base identities plus eight sized booths, with five additional low/opaque recipes. Generic booth frames are 2.5 m high; the eight sized booths are 2.8 m high. Procedural assets share owner-managed geometry/materials and preserve branding, entry, interaction and portal interfaces.

Custom self-contained GLBs can still be uploaded. They must use meters, are grounded/measured without silent resizing, and use conservative collision bounds. Original-mall and existing floor-shell GLBs remain compatibility features; they are not part of the procedural built-in inventory.

Create elevator/stairs/escalator portals with connected floor IDs and physical entries on each floor. Incomplete connections can be saved as drafts, but new authored layouts require complete entries to publish. Level transitions use paired portal transfers rather than simulating a continuous ramp ascent.

## Save and visit

**Save draft** stores an unpublished working document. **Load saved draft** restores it explicitly without replacing edits made while the request was pending. **Save venue** publishes to visitors after calibration, portal-entry and physical-clearance checks. A draft save does not clear the unpublished-change guard. Draft HTTP responses are private/no-store for cache control; this is not an authentication or authorization guarantee.

Visitors can search booths, POIs and avatar starts, or use the From/To route planner including the current avatar. Recast performs routing; step-free mode excludes stairs/escalators and uses elevator transfers where available. Guidance shows route steps/progress/arrival with cancellation and a bounded blocked-route retry. The minimap, follow camera, walk/run controls and temporary path reveal support exploration. A route to a named destination preserves the real avatar origin instead of resetting to a destination-floor spawn.

For arbitrary endpoints, choose **Pick point on floor…** in From or To and click a clear floor surface, or enter metric X/Z coordinates and choose the floor. Escape cancels selection. Previewing between two other points keeps the avatar in place; choose **Your current location** as From to walk using **Go**. Double-click bare floor to teleport safely. Click **Walk**, focus the scene, and use WASD/arrow keys; Shift runs and Escape returns to orbit.

## Exact physical dimensions

| Width × depth (ft) | Width × depth (m) |
| --- | --- |
| 10 × 10 | 3.048 × 3.048 |
| 28 × 10 | 8.5344 × 3.048 |
| 28 × 36 | 8.5344 × 10.9728 |
| 28 × 54 | 8.5344 × 16.4592 |
| 27 × 50 | 8.2296 × 15.24 |
| 20 × 20 | 6.096 × 6.096 |
| 14 × 38 | 4.2672 × 11.5824 |
| 40 × 45 | 12.192 × 13.716 |

`1 ft = 0.3048 m` exactly. SW13 = 30 × 30 ft = 9.144 × 9.144 m is a calibration reference, not an automatically placed booth. Model outer footprints, source coordinate mappings and construction dimensions are separate contracts. Editing a map scale must not resize a 10 ft booth.

## Pipeline and retained compatibility

- `bun run assets:validate` validates the generated 22 identities / 27 recipes: bounds, nodes, sockets, material roles, branding UVs, root transforms, variant interfaces and generated budgets. It needs neither Blender nor native model files.
- `reports/assets/procedural-inventory.json` records recipe SHA hashes, triangles, materials, approximate mesh draws and unique generated geometry-buffer bytes. Buffer bytes are not transferred bytes or total GPU allocations.
- `bun run assets:validate:compatibility` checks the optional original-mall GLB and Draco decoders separately. Its source remains `assets-source/scenes/atrium/backups/luminary-galleria-before-floorplans.blend`.
- `bun run assets:archive:guard` rejects runtime archive references. `archive/blender-ref/manifest.v1.json` and `reference-sheet.html` describe the verified local snapshot.
- `bun run assets:retirement:audit` produces a read-only SHA/provenance candidate ledger. It never deletes originals or persisted venue media.
- `assets:validate:native`, `assets:calibration` and `scripts/assets/validate.ts --publish` remain explicit historical native pipeline tools. They are not the default procedural build requirement.

Without Postgres, saved documents/media live under `.local/venue-data/` or `VENUE_DATA_DIR`. Preserve this directory across deployments. With Postgres configured, run `bun run db:migrate`, including `003_layout_document.sql` and `004_r3f_only_layout.sql`, before using the full-document/draft endpoints. PostgreSQL is not configured in the current local environment, so its deployment migration has not been applied.

The main scene retains warm directional light, cool fill/reflections, ACES tone mapping, antialiasing and quality-dependent shadows. Procedural replacement is not a guarantee of pixel-identical Blender path-traced imagery or a qualified integrated-GPU frame rate. Production roles, concurrent editing, tenant-safe persistence keys and real device qualification remain deployment work.

## For the chosen ones

Changing the asset file format cannot remove fill-rate or shadow-map cost. Keep rich geometry/materials shared, batch repeated opaque pieces, and measure actual draws and screen coverage; recipe buffer size alone cannot predict frame time.
