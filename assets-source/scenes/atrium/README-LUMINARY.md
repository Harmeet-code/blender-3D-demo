# The Luminary Galleria & Promenade

The current complete scene is **luminary-galleria.blend**. It combines the four
furnished retail floors, the refined P1 garage and fleet, and the new exterior.
The original `atrium.blend` remains the earlier mall source.

## Main files

| File | Contents |
| --- | --- |
| `luminary-galleria.blend` | Complete editable scene, native materials, lighting, cameras and charging animation |
| `luminary-galleria.glb` | Portable complete scene; geometric details and supported PBR materials |
| `atrium-parking-refined.blend` | Garage and vehicle refinement checkpoint before the exterior addition |
| `parking-refined.glb` | Updated P1 garage geometry with the varied vehicle fleet |
| `vehicles/*.glb` | Six reusable individual vehicles, centred at the origin with tyres resting on Z = 0 |

The `vehicles` directory contains `suv.glb`, `pickup.glb`, `utility-van.glb`,
`estate-car.glb`, `sedan.glb` and `electric-car.glb`. These are custom, unbranded
procedural models. Geometry is shared between matching parked instances in Blender.

## Design

- Four above-ground retail floors, as confirmed, and one underground parking level.
- P1: 31 bays, 18 parked vehicles, 13 available bays, protected pedestrian route,
  charging EV, four motorcycles/scooters and two bicycles.
- Garage fleet: 5 SUVs, 3 double-cab pickups, 2 utility vans, 2 estate cars,
  5 sedans and 1 EV. Two additional vehicles establish scale at the valet arrival.
- Pickups: recessed open beds, ribbed liners, inner wheel tubs, tie-downs,
  tailgates, running boards, rear steps and tow hardware.
- Vans: metal cargo panels, sliding-door tracks, rear cargo doors and secured
  low roof ladders. Passenger vehicles have fitted glass, shaped light signatures,
  panel gaps, mirrors, detailed alloys, brake discs and tyre sidewalls.
- Champagne aluminium cassette fins, glass curtain wall with graduated ceramic
  dots, halo-backed identity, two-storey luxury portals and onyx headers.
- An 18 m projecting canopy with Y supports, reflective soffit, recessed lighting
  and acoustic service panels. Glazed vestibule, revolving doors and central slider.
- Granite paving, tactile route, expansion joints, slot drainage, steel bollards,
  terrazzo planter benches, Japanese maple and silver birch planting.
- Valet concourse, four-sided ring road, guidance pylons, fire connection details,
  rear acoustic louvers, exhaust stacks and ivy screen.

## Previews

Final images: `luminary-exterior.png`, `luminary-promenade.png`,
`luminary-canopy.png`, `parking-refined-hero.png`, `parking-pickup.png`,
`parking-utility.png`, `parking-suv.png` and `parking-refined-ev.png`.
Files ending in `preview.png` are intermediate review renders.

## Rebuilding

Use Blender 4.5 LTS or a compatible newer version. The scripts run in this order:

1. `refine_parking.py`, then `finalize_parking.py` — original garage construction.
2. `refine_vehicles.py` — replace the garage fleet, retaining occupied bay transforms.
3. `refine_luminary_exterior.py` — add exterior to the garage checkpoint.
4. `finish_luminary.py -- --export --render` — final composition, checks, exports and renders.

Run each with Blender's `--background --python-exit-code 1 --python` flags.
The reports `vehicle-refinement-validation.json`, `luminary-exterior-validation.json`
and `luminary-final-validation.json` record geometry and count checks.

The Blender scene is the visual master. GLB exports do not include the area-light
rig, procedural texture networks or charging animation; a viewer supplies its own
lighting. Pylon availability is a modeled snapshot, not a live parking feed.
Materials and infrastructure follow the supplied visual brief; certification,
structural performance and building-code compliance are not established by a 3D model.
