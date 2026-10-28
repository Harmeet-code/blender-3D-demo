# Wash Rack Implementation Contract

## Purpose and scope

The wash rack is a fairground facility for washing and grooming livestock and equipment. This contract applies only to the `wash-rack` asset. It does not change the coordinate conventions, defaults, materials, collision rules, or rendering quality of other assets.

The existing `wash-rack` entry is a flat service-area placeholder with dimensions `[4, 0.1, 3]` and `collidable: false`. The new rack is a structured object with a visible floor, frame, plumbing, equipment, signage, variant-specific dimensions, wetness state, and water-use effects. Keep it inside the existing inventory, customization, per-instance state, serialization, undo, and Save paths.

## Dimensions and coordinate contract

Dimensions use the application's `[width, height, depth]` tuple in metres: X is width, Y is height, and Z is depth.

| Variant | Width | Height | Depth |
| --- | ---: | ---: | ---: |
| Equestrian wash bay | 3.6 m | 2.8 m | 5.0 m |
| Livestock wash stall | 3.6 m | 2.6 m | 5.0 m |
| Equipment wash bay | 4.2 m | 3.5 m | 6.0 m |

The canonical wash-rack-local origin is the entrance floor-grade point at `(0, 0, 0)`. X is centered around zero. The rack extends along positive Z from the entrance. The floor-grade Y datum is `0`.

Existing editor records may use center-anchored object placement. Implement an explicit wash-rack-only adapter between the editor's persisted placement and the canonical local origin. The visible mesh, footprint polygon, resize handles, route obstacles, and row-connection tests must use the same conversion. Do not change the origin of other assets. Existing persisted wash racks without variant metadata must not silently jump to a new origin or dimensions: preserve their saved footprint and dimensions through load/Save, and migrate to a standard variant only on an explicit user choice. New racks use a documented default variant and its defaults; livestock is the initial recommendation because it is closest to the existing placeholder's old width/height and corrected five-metre depth.

Changing to a new variant applies that variant's width/height/depth unless the user has explicitly resized the instance. After a custom resize, changing the variant preserves the user's chosen dimensions. Provide an explicit way to restore the selected variant's default dimensions. This state is per instance and round-trips through the existing layout serializer.

## Structure and details

### Floor and drainage

- The concrete slab is 0.15 m thick, with its top 0.02 m below the floor-grade datum.
- A shallow center drain pinches a further 0.03 m below the surrounding floor. Generate the floor normals and slopes procedurally and align floor boundaries with the outer slab edges.
- Expose the specified recessed slab at the actual venue floor: use an aligned cutout/recess or coherent perimeter treatment if the surrounding opaque floor would otherwise cover it. Do not bury the rack or fake visibility by disabling depth testing.
- A 0.3 m × 2.0 m longitudinal galvanized grate sits over the drain (metalness 0.9, roughness 0.2).
- Rubber diamond-tread canvas mats are 1.2 m × 1.8 m × 0.02 m.

### Variant structures

- **Equestrian:** open pipe frame; padded top rails at 1.6 m; stainless cross-tie rings at Y=1.6 m; coiled nylon quick-release ropes.
- **Livestock:** rails at 1.2 m with lower kickboards; brushed non-slip concrete; tie rings.
- **Equipment/vehicle:** wheel-guide curbs 0.3 m high; full steel mesh floor over the sump; clear corrugated-polycarbonate roof on light aluminium trusses.
- Frame posts are 0.08 m diameter and rails are 0.05 m diameter. Keep their geometry inside the selected dimensions.

### Water hardware and gear

- Procedurally generate dark-green hose coils with `TubeGeometry` following a Catmull–Rom curve.
- Include brass hot/cold valves, pressure gauge, rubber-grip wand, and a boom/nozzle assembly.
- The boom is 1.8 m long, mounted at Y=2.4 m, and rotates through a configurable arc. The spec mentions 180° construction and 360° delivery; support a 180° or 360° arc, defaulting to 180°, and a bounded angle value so saved edits cannot exceed that arc. The default 180° boom starts centered at 90°. When changing arc, preserve its physical heading by shifting the stored angle with the new arc midpoint.
- Include a rear gear board with sponges, scrapers, and halters, plus a bucket of soapy water with transmission 0.5.
- Delivery differs by variant: overhead boom for equestrian, wall reel for livestock, and high-pressure rail wand for equipment/vehicle.
- Include an idle nozzle drip when appropriate.

### Signage and safety

- Header sign: “WASH RACK”, 1.2 m × 0.3 m, at Y=2.5 m. Add a droplet vector icon.
- Variant subtitles: “EQUESTRIAN WASH BAY”, “LIVESTOCK WASH STALL”, and “EQUIPMENT WASH BAY”.
- Include a yellow triangular wet-floor warning with a slip silhouette and “CAUTION - WET FLOOR”.
- Instruction sign: “CROSS-TIE REQUIRED - DO NOT LEAVE ANIMALS UNATTENDED - CLEAN DRAIN AFTER USE”. Adapt animal-specific wording for the equipment/vehicle variant rather than displaying an inapplicable instruction.
- All signage stays attached to the rack and readable from its entrance/front side.

## Materials and wetness

Wetness is a persisted per-instance value in `[0, 1]`. It affects PBR base color and roughness as well as a puddle mask/normal in the floor shader. `running` is a persisted per-instance boolean for active water delivery. Do not replace the PBR pipeline with a flat fragment-color override.

- Steel: metalness 0.85, roughness 0.35, with a subtle microflake response.
- Concrete: dry `#9CA3AF`, roughness 0.85; wet `#4B5563`, roughness 0.08.
- Rubber: `#1F2937`, metalness 0.05; roughness 0.9 dry and 0.2 wet.
- The puddle mask is centered in floor UV space and fades at the slab boundary. Use a defined `smoothstep` edge order (the supplied reversed-edge form is undefined in GLSL; implement the mathematically equivalent transition with ordered edges).

Expose meaningful supported wash-rack controls in Customize: variant, running/water delivery, wetness, boom angle/arc, and any other authored rack-specific choices. Keep raw roughness/metalness out of the editor's general controls; these material values are authored defaults and respond to wetness.

## Water effects and distance policy

The permanent-quality requirement applies to structural rack geometry. Water effects have an explicit distance-based quality policy:

- Under 15 m: approximately 800 instanced droplets per active rack, using conical capsules and a splash shader.
- 15–40 m: animated transparent, noisy cone representation with a transmission value of 0.7.
- Beyond 40 m: disable water emitters and freeze the visual wetness state to a static appearance.
- Keep a target of about 20 simultaneous racks in mind. Share materials, textures, and cached geometry. Prefer shared GPU particle positions. Do not create hundreds of React meshes or per-droplet React state.

Distance scaling applies only to water FX, never to the structural mesh, frame, signs, or saved rack geometry. The existing `running`, wetness, and variant values remain stable while FX detail changes.

## Navigation, placement, and approach

The rack uses the existing `collidable` user toggle and is collidable by default for newly placed variants. Explicitly upgrading a legacy rack by choosing a variant opts it into the new physical-rail collision behavior. Changing type on an already typed rack preserves its existing collision toggle. When enabled, routing receives only the multipart physical barriers; it does not receive a solid rectangle over the rack. Existing serialized values remain unchanged until an explicit type choice. Provide a wash-rack-specific inside-walkable polygon and a centered approach corridor 1.5 m wide, from entrance Z=0 to Z=-2.5 in canonical rack-local coordinates.

Navigation blockers are the simplified physical boundaries, not a solid rectangle over the complete rack:

- Side rails are 0.08 m thick at the selected variant's rail height/depth.
- Include the rear boundary and corner posts with 0.1 m radius.
- Preserve a clear entrance so handlers can enter and route through the interior.
- Keep the sump/grate, floor surface, and non-blocking equipment from closing the entrance.

The spatial/routing owner implements this obstacle shape and verifies placement, walkable-zone clipping, and route connectivity using the same canonical-origin adapter as rendering. The visible rack, object footprint used for placement, and navigation geometry must agree.

## Rows and shared infrastructure

- Exact side-by-side fit uses actual selected widths: 3.6 m for equestrian/livestock, 4.2 m for equipment/vehicle, before any explicitly configured clearance.
- Respect rotation, resizing, and the canonical entrance direction.
- When compatible bays share a side, collapse duplicate right-side partition of stall N and left-side partition of stall N+1; deduplicate posts as well. Do not persist hidden manual partition flags. Compute ownership deterministically from neighbors.
- Share a rear plumbing manifold and drain line, extending 5 m for livestock/equestrian rows and 6 m for equipment/vehicle rows.
- Do not merge incompatible variants whose heights, depths, or construction materials differ.

The spatial owner implements deterministic row adjacency/snapping and supplies connection flags to the renderer. The renderer consumes these flags to avoid duplicate rails/posts and show continuous rear utility lines.

## State, compatibility, and serialization

- Add rack-specific optional fields to the existing plan-object schema; do not create a parallel persistence store or global material controls.
- The existing recipe ID remains `wash-rack`, preserving old serialized records and all current recipe references.
- New placements initialize the selected supported variant, variant dimensions, wetness/running, and bounded boom angle/arc. A custom-dimensions state is derived from the current dimensions relative to the variant profile, rather than duplicated in another persisted flag.
- Old records missing these fields load safely without changing their persisted placement, dimensions, or unrelated object data. Saving an untouched legacy rack must not trigger an implicit geometry migration.
- An explicit variant choice performs the documented conversion; manual resize is tracked per instance and prevents later variant changes from overwriting those dimensions until the user requests a reset.
- Edits use the existing shared draft, per-instance duplication, undo/redo, and sole top-right Save. No component-local server save or Apply button is added.

## Ownership boundaries and acceptance evidence

- **State/schema/inventory/customization/persistence:** plan-object fields, defaults, backward-compatible decode/serialize, independent copies, variant/dimension controls, and live shared-draft behavior.
- **Rendering:** high-detail structural wash-rack meshes, materials, signage, hose/boom, wetness shader, shared water FX, and FX-only distance tiers.
- **Spatial/routing:** canonical transform agreement, placement footprint, enterable interior/approach corridor, rail/rear blockers, variant-aware row adjacency, post/partition de-duplication, and continuous shared utilities.

Before claiming completion, source review must confirm the recipe remains backward compatible, new defaults match the table, all wash-only geometry uses the adapter, placement and routing do not block the whole rack, and structural quality does not depend on camera distance. The requested no-tests instruction remains in effect; do not claim runtime route, 20-rack performance, or visual acceptance without an authorized verification pass.
