# Shipping & Receiving (`shipping`) specification

## Purpose and variants

A freight hub for exhibitor logistics, crate staging, and heavy material transfer. It has three variants: `dock-bay` (raised platform, roll-up bay door, canopy and leveler), `container-yard` (procedurally colored ISO container rows), and `staging-only` (ground-level marked apron and material-handling props).

## Coordinates and dimensions

Object-local origin is floor grade, centered on the dock opening plane; `-Z` points toward the truck apron and `+Z` into the building. The dock-bay default is **8.0 × 5.0 × 8.0 m**. This uses the user-approved 5.0 m overall structure to preserve the 3.2 m clear door above a 1.2 m platform. The 4.4 m clear-opening head leaves room for the roll drum and canopy above it. Container-yard defaults to 12.0 × 5.8 × 10.0 m; staging-only to 6.0 × 2.4 × 6.0 m.

## Dock-bay visual construction

- Concrete raised platform: 8 × 1.2 × 3 m, centered at Z=+1.5, Y=+0.6; two black rubber bumpers on the apron face, 2.8 m apart.
- Central 2 × 2.2 m hinged diamond-plate dock leveler, adjustable ±12°. Preserve its connection to an aligned trailer; avoid a visibly floating gap.
- One 3 m clear-width, 3.2 m clear-height opening for W<10 m. At W≥10 m, independent bays use 4 m center spacing (W=12 m gives two doors). Each bay has a 16-slat roll-up door with a 0.4 m drum. Animate open/close over 2.5 seconds with ease-in/out cubic motion. The original 3.4 m drum and 4.2 m canopy elevations conflict with the accepted 3.2 m clear opening; raise drum and canopy within the 5 m structure.
- Corrugated canopy projects 1.8 m forward and uses diagonal supports. Apron has 45° alternating yellow/black 0.15 m hatching from Z=-0.5 to -4.5, `BAY 01` and `KEEP CLEAR - DOCK ACCESS` markings, two yellow/red-banded bollards, tethered wheel chocks, and an adjustable dock lamp.
- Two-lens signal: red `#EF4444` while occupied, locked, loading, or opening; green `#22C55E` while idle and clear. Include overhead “SHIPPING & RECEIVING”, bay number, receiving hours, forklift warning and PPE signs.

## Container yard and staging

Use ISO dimensions 2.44 × 2.59 × 6.06 m, ribbed sides, eight corner fittings, locking bars/handles/cams and decals. Choose reproducible colors from freight blue `#1D4ED8`, orange `#EA580C`, red `#B91C1C`, green `#15803D`, and slate `#64748B`. Stack at most two containers, aligned by corner castings; expand rows without distorting container dimensions.

Seed props deterministically and expose density 0–1. Always-rated props are detailed wooden pallets, braced crates, yellow pallet jack, and forklift. Near-only props are cartons, stretch-wrapped pallets, hand truck, cage trolley, and check-in desk. Do not randomize on each frame. The forklift's decorative 3 m loop takes 12 seconds and raises the fork 0.4 m while respecting its reserved movement envelope.

## Trailer, state and movement

Trailer dimensions 2.5 × 4.0 × 13.6 m, backed along -Z from Z=-1.3 to -14.9. Include landing legs and two rear doors opening 270° when docked. Keep trailer cargo walkable from the leveler; use a shell collider rather than a solid interior blocker. Freight target `(0,0,-3)` is for vehicle navigation. Pedestrians use the elevated platform at Y=1.2, connected by a 0.9 m side stair to the ground apron; vehicle maneuvering lanes remain excluded from pedestrian navigation. Staging entry is `(3.2,1.2,2.5)`, stairs at X=3.8/Z=0.5.

Persist door state per bay, trailer docked state, leveler angle, seed, density, and ambient forklift setting in the shared draft. Snap the rear wall at Z=+3 to a building envelope and cut a 3.2 × 3.2 m portal only through a supported, undoable host-wall edit. For sloped terrain, flatten the local apron only through the editor's supported terrain-grade mechanism.

## Boundaries

Geometry outside an object's nominal footprint (notably the long trailer, canopy, stairs, and wheel chocks) must be included in placement/bounds decisions when present; never scale the trailer to fit the dock object. Legacy shipping records without a variant retain their current geometry until explicitly upgraded. Unsupported host-wall portal cutting or sloped terrain grading must be reported as a limitation rather than represented as a completed feature.
