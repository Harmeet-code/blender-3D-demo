# Procedural service assets: implementation and brief reconciliation

Reviewed 2026-10-16 against the complete user attachment, preserved verbatim in
`../../.kiro/specs/admin-floor-plan-builder/service-assets-brief.md`.
This supplements the existing requirements, design and task documents; it does not
replace or reduce them. The attachment covers five assets, all available in the
Amenities inventory and dispatched by `ProceduralObject.tsx`.

## Implemented construction and corrections

| Asset | Existing implementation gaps corrected | Current result |
| --- | --- | --- |
| Information | Widths stopped growing at 2 m; accessible apron obstructed knees at 0.5 m; full plinth crossed the knee space; tops exceeded fixed heights; lamp and sign support floated; cyan material tinted the white icon; back wall was missing from routing obstacles. | 60/40 width split, 1.10/0.76 m finished tops, 0.70 m clear underside between side supports, 0.02 m chamfered laminate, standing-section plinth, tiered acrylic rack with papers, angled tablet, attached gooseneck lamp, bracket-supported sign at editable height with independent white pictograms. Recast blocks both counter and back panel. |
| Food kiosk | Awning floated and rose outward; stripes used extrusion UVs incorrectly; short cabins overflowed at the header; finished counter was too tall; menu silently truncated at 64 characters; no steam wand, stacked-cup detail or rear hatch; queue collision depended on placement order. | Roof-attached extrusion with 0.8 m outward projection and 15-degree downward slope, width-aligned blue/white stripes, 0.95 m finished counter, fitted opening/header, full editable wrapped menu below awning, coffee machine/spouts/gauges/wand, POS, two instanced cup stacks, warm strip, rear staff hatch, food pictogram and labelled queue boundary. Queue entry is 0.5 m inside its far edge. |
| Water | Filled cylinders hid the grates; fixed basin coordinates exceeded the declared footprint; refill panel covered a solid pedestal; lower basin floated; only one jet existed; flow did not invalidate demand canvases. | Hollow oval lathed basins, 0.95/0.76 m fixed rim heights, real recessed refill alcove/nozzle/sensor, supported lower basin, slatted drain grates, two transmissive animated jets at -1.2 UV units/s, bottle-count display, droplet badge and near puddle. All hardware fits its declared footprint. |
| First aid | Opaque door remained behind the glass; front cross obscured the window; tall-room header overflowed; cot extended through the rear wall; kit floated without a shelf and could not be seen; pulse did not sustain demand frames. | Four door pieces around a real 0.4 by 0.5 m vision opening with 0.01 m glass, visible red-cross kit on a supported shelf/cabinet, fitted cot at 0.45 m, handle/kick plate, four unobstructed external cross signs, roof sign tower and beacon. Pulse is max(0, 0.3 + 0.6 sin(6t)), static under reduced motion. |
| Exit | An effect snapped the door immediately; damping did not implement 0.6 s easeOutQuad; wide frames had uncovered gaps; tall signs remained at 2.55 m; floor chevrons pointed inward; open leaves disappeared from navigation; approach width shrank with narrow frames; far mesh closed the opening. | Reversible 600 ms easeOutQuad swing from the current angle, matching jamb/leaf widths up to 2.2 m clear opening, panic bar/red pad/instructions, above-frame EXIT/running-man sign and backup bulbs, outward floor chevrons, correctly placed sink marker, open-leaf routing obstacle, fixed 1.5 by 2 m approach, and a six-quad/12-triangle far silhouette preserving the open state. |

`use-service-motion.ts` observes reduced motion and document visibility once per
change, culls continuous service animation outside the camera frustum, and wakes
`frameloop="demand"` canvases explicitly. Water flow stops at far LOD; the distant
first-aid beacon uses a static material. Animation phases are transient refs and
never become undo, save or revision events. Textures and owned custom geometries
are disposed on replacement/unmount; cup repetition uses native instancing.

Queue and exit approach validation is symmetric: moving a reservation over an
existing solid is rejected as well as moving a solid into an existing reservation.
Blocked zones and authored walls are checked too. Open exit leaves must fit within
the floor and avoid other solids. Reserved approaches remain walkable floor;
they are not added as navigation obstacles. Visual-height helpers include overhead
signs and backup fixtures. Fixed counter/basin heights reject vertical scaling,
and the inspector disables Scale Y for information and water objects.

## Explicit resolutions of inconsistent dimensions

1. **Water footprint:** two 0.4 m basins centred 0.35 m apart need at least 0.75 m
   width; the supplied Z positions also exceed a 0.6 m depth. New catalog objects
   therefore use **0.8 by 1.2 by 0.7 m**. Basin centres are +/-0.175 m, Z=0.1 m.
   Existing saved W/D values are preserved and fit the assembly proportionally;
   the requested 0.5–0.9 / 0.5–0.8 m ranges remain accepted. Only the two rim
   heights stay fixed. This deliberately resolves the brief's conflicting overall
   and part dimensions rather than rendering invisible collision overhangs.
2. **Accessible information counter:** the full-width kick plinth and deep solid
   apron conflict with the requested clear knee area. The plinth now serves only
   the standing section; a thin apron begins at 0.70 m under the accessible top.
3. **Information sign support:** the rod joins the cylinder underside, 0.2 m below
   its centre, and reaches an attached back-wall bracket. Its length is derived
   from those surfaces rather than the contradictory nominal 1.1 m rod length.
4. **Small kiosk:** a 1.4 m opening above a 0.95 m counter cannot fit a 2.2 m
   cabin plus header. Opening height is min(1.4, H - 1.05), leaving a header.
5. **Door direction:** local +Z is the hall/customer side. Three.js positive Y
   rotation sends the hinge-to-tip +X vector towards -Z; therefore **+90 degrees**
   is outward. Literal -90 degrees from the brief would open into the hall.
6. **Variable exit width:** clear width is min(W - 0.15, 2.2); both jambs use the
   remaining half-width. Leaf height is H - 0.15 and sign centre is H + 0.15.
7. **Destination clearance:** exact interaction nodes remain plan markers.
   `portalLanding` uses the customer/queue/water/aid/exit node as the regular
   direction destination, moved outward where necessary to leave at least 0.55 m
   from the unscaled body front. Existing whole-avatar and endpoint-join checks
   still reject unsafe or unavailable routes. Staff markers are not public routes.

## Consumer integrations still outstanding

These are not presented as completed by the asset work:

- Staff-only access inside the kiosk and emergency-responder access inside first
  aid require actor/access policy integration. Public Recast currently treats
  those cabins as solid obstacles and routes to their external service points.
- Exit markers now work as regular studio destinations, but the existing worker
  has no evacuation simulation or priority-goal API. No evacuation trigger,
  throughput guarantee or capacity rating has been implemented. The brief's
  numerical life-safety assertion is not a validated product capability.
- Dropping an exit does not automatically cut a hole through existing authored
  perimeter walls. A matching wall opening and exterior walkable area must be
  authored before a route can traverse that perimeter; the preview does not
  demonstrate a complete hall-to-exterior evacuation route.
- The new frontend uses placement polygons and Recast obstacles, not a 3D physics
  collider layer. Under-awning head collision, counter-height physical colliders,
  and continuously rotating leaf colliders need a consuming physics integration.
  The routing leaf changes to its authored final state when `exitOpen` changes.
- Far silhouettes are simplified. Information is under its 90-triangle target,
  water uses 38 mesh triangles, first aid uses 44, and exit uses 12. These are
  geometry counts from construction (excluding lines/shadows), not GPU benchmarks.
  Near budgets, per-instance GPU material sharing, venue-scale draw calls and
  mobile performance still need measured profiling; no benchmark pass is claimed.
- Glass, acrylic, flowing water and puddle use physical transmission; final
  appearance depends on the actual venue lighting. No external textures, fonts,
  models or environment maps are fetched by these assets.

No backend or wire-schema change is required: existing `infoSignHeight`,
`kioskQueueDepth`, `kioskMenu` and `exitOpen` metadata remain in the bounded
`fpb:v1:` instance envelope. The original detailed specs and recovered snapshots
are retained. Furniture changes being developed concurrently are preserved.

## Verification

The isolated development workbench is `/admin/floor-plan?servicePreview=1`.
It supports cycling individual assets, restoring the overview, orthographic plan
view, orbiting and opening/closing the exit on a demand canvas, without an event
client or mutations to venue data. Preview modules are excluded from production.
Manual browser review covers all five close-up models, the medical kit through
the window, the menu/awning and door swing/plan arrows. Compiler, lint, formatting
and standalone Vite build are the code checks; no automated tests were added or
run, as requested. Live backend round-trip and evacuation behavior are unverified.
