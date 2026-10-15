# Booth construction refinement — 15 October 2026

This implements the user's supplied Standard Rectangular Booth / Custom Polygon Booth description
in the isolated floor-plan frontend. Other inventory items remain unchanged planning placeholders.
The source brief was the attached `Pasted text.txt`; no external models, images or fonts are fetched.

## Geometry and appearance

- Both booth recipes use a shared modular renderer: a 50 mm raised carpet platform, 80 mm inward
  panels, aluminum plinths/corner profiles, 1 m panel joins, fascia beams and optional light strips.
- The 350 mm fascia sits above open edges and doorway openings. Corner, peninsula and island
  layouts expose two, three and four sides relative to the selected gate. Custom edge modes are
  wall, full opening, 1.2 m doorway or 2 m doorway.
- Corner profiles use bounded inward miter intersections, including concave corners. Near detail
  includes narrow panel grooves, modular posts and recessed leveling-foot geometry.
- Roof choices are open, a grid clipped to the polygon interior, and a solid polygon cap. The truss
  grid does not bridge empty courtyards. It is a clipped grid, not a structural engineering model.
- Carpet/panels/aluminum use separate PBR presets: roughness 0.95/0.85/0.35 and metalness
  0/0.05/0.85. Owned CanvasTextures provide deterministic carpet bump and company/booth signage.
  The scene supplies a small procedural reflection environment, without a remote HDR preset.
- Surface IDs are `floor`, `wall-N-inner`, `wall-N-outer`, `header-N`, `plinth-N`, with zero-based N.
  Floor color inherits automatic sampling or explicit object color; individual overrides take
  precedence. Wall faces inherit the panel primary color. Header/plinth defaults remain dark/silver.
  Availability, heat and collision colors remain temporary display overrides.
- A centered company/booth title is visible from above, with solid dark wall strokes and dashed
  cyan opening markers. Label bounds are fitted inside the polygon, including L/U shapes.
- Stretching bakes the footprint and height into geometry while retaining physical wall/frame/
  platform thicknesses; it does not multiply an 80 mm profile by the object's scale.

## Settings and persistence

The Inspector exposes shell layout, roof, edge openings, panel/surface colors, snapping, clearance,
and storage. It also supplies L/U examples. Settings live in the optional validated `boothDesign`
recipe field and survive the existing versioned metadata envelope. They use the current staged
Apply/Discard/undo boundary. No backend/shared schema was changed.

The optional rear-left closet occupies 1.7 × 1.1 m; its 0.8 × 2 m door slides 0.8 m into a pocket
behind the front panel. Opening state persists. The transition uses a 0.4 s cubic easing, demand
invalidation, and reduced-motion handling. Storage placement is rejected if the enclosure crosses
the booth boundary; navigation conservatively excludes the storage enclosure regardless of door
state. The closet is not an attendee destination.

New rectangular booths default to 3 × 2.6 × 3 m, with width/depth 2–12 m and height 2.2–4.5 m.
New polygon booths start with a 4 × 3 m rectangle and 2.6 m height; their construction contract
allows up to 32 vertices, height 2.2–6 m, 0.8 m minimum edges and 45° minimum convex angles.
The existing simple-polygon validation/triangulation utilities remain authoritative. Both winding
orders are supported using signed normals; existing vertex/surface IDs are not silently reordered.
A new sweep-line algorithm is unnecessary for this bounded authoring contract.

Legacy objects without `boothDesign` render with the new materials/construction but retain their
previous geometric acceptance and original demo preset heights. New shell-scheme objects clamp
demo preset heights to the new 2.2 m minimum; price/type/color/preset cycling remain intact. Booth
presets do not alter stairs or other inventory recipes.

## Placement, openings and navigation

The brief explicitly adds 0.10 m rectangular / 0.15 m polygon external clearance. New recipes enforce
these editable physical margins using polygon distances; this supersedes the prior unbuffered
edge-contact policy for these recipes only. Old/unbuffered objects retain edge-contact behavior.
Two matching closed booth walls with snapping enabled may share an edge. Snapping targets corner
vertices on the 0.5 m grid or nearby matching closed edges; it does not impose a separate aisle.

Object placement still reserves the entire booth footprint. Studio Recast navigation instead uses
actual wall runs and corner columns, leaving openings and the interior traversable. If a floor has
an explicit positive walkable mask, the booth's footprint joins that mask before its wall/column/
storage exclusions are applied. This does not add a second routing engine. Canonical booth
entrance selection follows an available opening rather than retaining an entrance on a closed edge.

The supplied U example has 1.5 m end edges. A 1.2 m doorway plus two 0.3 m corner margins requires
1.8 m, so the example uses full openings. The UI explains this; invalid narrower cutouts remain
correctable and cannot be applied.

The existing backend/visitor physical consumers still do not decode this procedural recipe.
Tasks 44/49 retain that integration limitation. Studio navigation/visual improvements do not certify
backend publication or old-visitor compatibility; collision flags were not disabled to conceal it.

## Resources and verification

Geometry is merged per material bucket with vertex colors, avoiding a mesh for every small profile.
Placement transforms do not rebuild the local construction geometry. A hysteresis-based near/far
switch removes detailed joins/grooves/fixtures at distance. Textures and generated geometry have
owned disposal. Repeated parts are batched within a booth; cross-floor instancing is not claimed.
The brief's triangle counts are performance budgets, not a reason to add invisible geometry;
neither those budgets nor 50-booth performance have been measured in this session.

An isolated development preview is available at `/admin/floor-plan?boothPreview=1`. It has no venue
API, persistence or recovery-draft actions. The preview module is excluded from production builds.
It displays both recipes and permits layout, L/U shape, roof, closet/door and camera inspection.

TypeScript, oxlint, formatting and the standalone production build were checked. Browser inspection
covered the standard model, corner/island layouts, L/U footprints, top labels, truss, and closet door;
the preview's captured warning/error log was empty. Automated tests remain skipped as requested.
Live backend persistence and publication remain unverified; the backend on port 8000 is unavailable.
