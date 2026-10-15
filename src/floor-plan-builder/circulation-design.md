# Procedural circulation collection

Implemented from the user's 15 October 2026 stairs/elevator/escalator/ramp brief. All construction, maps and signs are generated locally in R3F/Three.js. No external model files, downloads, fonts, packages or backend changes are required.

## Resolved dimensions

Dimensions are `[overall width, floor-to-floor rise, overall depth]`, in meters. The editor keeps its existing footprint-center origin; `circulationLandings()` exposes explicit local landing coordinates instead of silently changing placement origins.

| Recipe    | New default        | Construction calculation                                                          |
| --------- | ------------------ | --------------------------------------------------------------------------------- |
| Stairs    | 2 × 3 rise × 7.48  | 17 risers, 16 × 0.28 m goings, **two** 1.5 m landings                             |
| Elevator  | 2.5 × 3 rise × 2.5 | 2.4 m cabin; shaft extends to **5.6 m**, including headroom above the upper floor |
| Escalator | 2 × 3 rise × 7.196 | 3 / tan(30°) plus two 1 m horizontal transitions                                  |
| Ramp      | 2 × 0.5 rise × 9   | 6 m sloping run at 1:12 plus two 1.5 m landings                                   |

The brief's 5.98 m stair correction counts only one landing. Its elevator cabin travel of `rise - 2.4` cannot reach the specified upper landing; cabin travel here is the full floor rise, with headroom added to the shaft. A switchback contains two clear-width flights and a 0.2 m separation: 2 m flights therefore need **4.2 m overall width**, not 2 m. Stair flights with an odd riser count retain equal requested going by extending the shorter flight's upper platform. Ramp runs above 0.76 m rise receive intermediate landings; switchbacks divide the rise across two flights.

## Implemented construction and interaction

- **Stairs:** open 40 mm treads, 20 mm overhang, instanced 5 mm safety nosings, diagonal 50 × 200 mm stringers, tubular rails, newels, instanced balusters at 120 mm spacing, grip bump maps and near hex fasteners. Straight/switchback layouts, green/yellow nosings and proportion validation are editable.
- **Elevator:** dark structural cage, glass shaft and cabin sides, guides, fixed-height cabin, rubber floor, metal mirror approximation, emissive ceiling, landing door portals, steel call panels with tactile dot detail and generated cyan target indicators. Bi-parting doors use 1.2 s cubic easing. The cabin closes its occupied landing's doors before moving at 1 m/s, then opens only at the destination. Inspector controls set lower/upper target and doors open/closed; there is no avatar arrival trigger yet.
- **Escalator:** brushed housing/skirt, glass balustrades, looping rubber handrails, instanced horizontal treads with three yellow borders, flat-to-incline-to-flat travel and concealed return phase. Comb teeth, green emissive entry strips, reversible entry signs, operating direction, speed and start/stop controls are included. Belt UV motion uses the same signed speed as the tread loop. Return instances collapse beneath the comb housing rather than rendering a second exposed flight.
- **Ramp:** 50 mm deck, rubber grip bump map, protected curbs, yellow edge strips, dual rails at 0.86/0.68 m with rounded extensions, supported landing rails and generated wheelchair markings. Editable straight/switchback layout, width, slope ratio and landing length; rise/run checks follow the supplied design bounds.
- **Placement:** new construction metadata opts into proportion validation, clear external landing approaches and 150 mm proximity snapping to floor boundary extents. Snapping includes the approach envelope and is followed by exact floor/obstacle checks; it does not create mezzanine cutouts or infer slab edges. Existing portal reference markers retain their original representation. Legacy objects are not automatically resized on import; adopting the new settings is an explicit inspector action.
- **Linked floors:** a new stairs/elevator/escalator source links from a lower floor to one higher floor. The source fits the actual elevation difference; the destination receives an upper landing marker rather than a second full flight. Later edits cannot silently make a connected source rise disagree with its floor elevations. Floor history and the existing metadata envelope remain the persistence mechanism.
- **Detail levels:** detailed construction inside 24 m, cheap overview silhouettes beyond 28 m with hysteresis. Overview machinery is static and glass uses cheap transparency. Repeated treads, balusters, teeth and structural members use instancing. The brief's triangle counts are budgets, not measured acceptance results or minimum geometry quotas.

Animation progress, door openness fraction and conveyor phase use refs inside the render loop. Only authored targets/settings persist in `circulationDesign`; animation does not increment revisions or fill undo history. Invalid edited dimensions render a bounded red wireframe while validation explains the problem, avoiding unbounded instance allocations.

## Physics and navigation boundaries

These models use the existing conservative footprint collision and portal adapter. They **do not** add inclined physics colliders, door-shaped physics apertures, stair off-mesh cost multipliers, elevator wait costs, accessible route filters, directional escalator traversal or walkable 3D ramp navigation. The current shared Recast worker and unchanged backend wire schema cannot express those features. Ramp remains a planning object, not a linked inter-floor portal. Existing portal routes remain bidirectional even when the escalator's visual direction changes. A wheelchair symbol or proportion check is not an accessibility/code certification.

Exact physical consumers, native Recast connector semantics, collision-ready ramp surfaces and authenticated save/publish/reload remain follow-up work under existing tasks 44/49 and the navigation integration scope. Never disable collisions to pretend those integrations are complete. The original detailed specs and restored snapshots remain intact.

## Preview and verification

Development URL: `/admin/floor-plan?circulationPreview=1`. This isolated page imports no event store or venue API. It offers individual/collection inspection, switchbacks, elevator call/door controls, escalator stop/reverse, top view and day/night lighting. It cannot modify the user's event draft.

Feature typecheck, lint, formatting, standalone build and browser rendering are the appropriate non-test checks. No automated tests are added or run, per the user's instruction. Performance budgets, production backend persistence, physical navigation and accessibility compliance are not established by those checks.

Verification on 15 October: feature TypeScript, oxlint, formatting and the standalone production build pass. Browser inspection covered the four assets, switchbacks, elevator ascent/return and arrival doors, escalator stop/reverse/restart, and ramp plan/night views. No warnings/errors were captured in the isolated preview. The production build retains the existing large-chunk warning. The recovered Kiro requirements/design/tasks snapshot hashes are unchanged. No event draft was loaded, restored, discarded or published by the preview.
