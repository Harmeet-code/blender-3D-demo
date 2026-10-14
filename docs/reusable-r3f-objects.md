# Reusable R3F object components

The new components are under `src/features/mall/objects/`. Import them from
`src/features/mall/objects/index.ts`, or directly from their individual `.tsx`
files. They render below an existing R3F `Canvas`; they do not create another
canvas or download a GLB or the complete mall geometry blueprint.

## Component files

| Folder | Components |
| --- | --- |
| `vehicles/` | `SUV`, `Sedan`, `ElectricCar`, `PickupTruck`, `UtilityVan`, `EstateCar` |
| `furniture/` | `Chair`, `Sofa`, `Table`, `Bench`, `Planter` |
| `circulation/` | `Escalator`, `Staircase`, `ElevatorEntrance`, `GlassBalustrade` |
| `fixtures/` | `Bollard`, `FireExtinguisher`, `SlattedConsole`, `PendantLight` |
| `catalog/` | 47 named components covering all existing booth sizes and venue assets |

The catalog includes `Booth10x10`, `Booth28x10`, `Booth28x36`, `Booth28x54`,
`Booth27x50`, `Booth20x20`, `Booth14x38`, `Booth40x45`, `BoothFrame`,
`BoothCeiling`, `BannerStand`, `DisplayCase`, `Safe`, `Pallet`, `Forklift`,
`WallPanel`, `FloorTile`, `InfoDesk`, `Podium`, `QueueRail`, `FoodKiosk`,
`TrashBin`, doors, signs, parking bays, roads, a crosswalk, `EvCharger` and
architectural shell pieces. `catalog/index.ts` is the full export list.

`ExhibitionChair`/`ExhibitionTable` are the existing booth furniture;
`Chair`/`Table` are the reconstructed Luminary lounge furniture. `SquarePlanter`
and `ModularBench` similarly retain the existing venue recipes.

Each of the six vehicle files selects a class from `sharedVehicle.tsx`. This
shared builder contains the authored loft, wheel openings, wheels, glazing,
cabins, mirrors, trim and interior construction. Furniture and circulation
files compose native geometry and shared primitive helpers. Catalog components
select the existing code-authored recipes in `src/features/assets/catalog/`;
these are not wrappers over the mall's exported scene data.

## Usage

```tsx
import { Canvas } from '@react-three/fiber';
import { SUV, Chair, Escalator, Booth28x54 } from '@/features/mall/objects';

export function MyScene() {
  return (
    <Canvas shadows camera={{ position: [12, 8, 16] }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[-8, 15, 10]} intensity={2} castShadow />
      <SUV position={[0, 0, 0]} paint="#50717a" />
      <Chair position={[-3, 0, 0]} upholsteryColor="#b57557" />
      <Escalator position={[4, 0, -6]} rise={4.4} run={9.5} width={2.1} />
      <Booth28x54 position={[-12, 0, -12]} />
    </Canvas>
  );
}
```

Supply environment/reflection lighting for the intended metal and glass
appearance. The app's standalone gallery uses local procedural lighting and
an environment made from light panels; it does not require a remote HDR image.

## Units and props

- One world unit is one metre; group rotations use radians.
- Group `position`, `rotation` and `scale` place the component. Vehicles face
  web +Z and use Y-up; an internal transform converts authored native axes.
- Vehicles accept `paint`, `detail="high" | "low"`, and
  `dimensionsMetres={{ length, width, height }}`. Dimension overrides scale the
  nominal body proportions; mirrors/trim can extend beyond those dimensions.
  Caller group scale composes with dimension overrides.
- Furniture accepts physical dimensions and finish colors; its detail values
  are `baseline` and `low`. `Table.height` defines the tabletop height; the
  included vase/stem extend above it. Planter width/depth define its vessel,
  with foliage extending beyond that footprint.
- Escalators accept `rise`, `run`, `width`, `landingLength` and `direction`.
  Defaults are the mall's 4.4 m rise / 9.5 m run / 2.1 m width. Both travel
  directions keep rail and bed geometry aligned. These are visual assemblies,
  not animated escalators or automatic physics/navigation links.
- Catalog components accept transforms, `detail`, shadow flags and per-material
  `surfaces` overrides. Overrides clone materials privately; one customized
  instance does not recolor another instance.
- The eight booth names encode feet. Their recipes use exactly 0.3048 m/ft;
  for example, 28 × 54 ft is 8.5344 × 16.4592 m. No booths are automatically
  placed on a user's floor image by this library.

## Preview and resource ownership

Open `/view/default-event#/mall?objects=1`, or choose **Reusable objects** on the
mall page. The gallery presents all 66 components, search, full/lightweight
detail, size and finish controls, and measured mesh bounds. Its fit action uses
actual bounds and a suitable camera direction for long circulation objects.

The original whole mall still uses its source-faithful geometry snapshot. This
library adds independently usable, editable assemblies; it does not silently
replace the original's 11,259 objects with approximate procedural models.
Defaults follow source proportions/materials, but reconstruction is not a claim
of identical evaluated topology or pixel identity for the new standalone assets.

Declarative geometry/materials are R3F-owned. Manually allocated custom geometry
has explicit cleanup. Catalog instances borrow the existing bounded recipe
cache; shared geometry is not disposed by one instance. Private finish materials
have separate cleanup. Large scenes should batch repeated assemblies rather
than mounting thousands of independent detailed meshes; component names alone
do not reduce draw calls.

## Evidence and regeneration

Component-library implementation is complete: production TypeScript/Vite build,
lint and targeted formatting checks passed. The final build took 11.51 seconds;
existing large Three/physics vendor chunk warnings remain. The standalone
gallery renders all 66 entries with valid bounds and no GLB or full-mall
blueprint requests.

- `reports/performance/mall-objects-capture.json`: representative live previews,
  dimension/finish/detail changes, zero page errors and zero GLB/blueprint requests.
- `reports/performance/mall-objects-coverage.json`: all 66 baseline components
  plus the 19 new assemblies in lightweight detail; finite nonempty bounds.
- `reports/performance/object-*.png`: representative screenshots.
- `reports/performance/mall-objects-navigation.json`: switching to the preserved
  whole mall and reopening the component library passed with zero page errors.
- `mall-objects-typecheck.log`, `mall-objects-lint.log`,
  `mall-objects-format.log` and `mall-objects-build.log`: compilation evidence.

The small named catalog entrypoints can be regenerated with
`node scripts/assets/generate-object-components.ts` using Node 24. The script
reads metadata/TypeScript declarations without loading the renderer. Format the
generated files afterward. The hand-authored vehicle, furniture, circulation
and fixture implementations are not overwritten by that script.

No native sources, GLBs or historical assets were deleted. No broad test suite
was run; checks here target the implemented components and their integration.

## Remaining whole-mall and authoring work

- Replace the complete mall snapshot with assemblies built from these components,
  including the remaining architecture, landscaping and parking systems. The
  existing source-faithful mall remains operational during that work.
- Register the 19 new reconstructed assemblies with admin placement metadata,
  provider resolution, persistence and collision/navigation contracts. The 47
  existing catalog assets already retain their authoring/provider integration.
- Compare reconstructed assemblies and the eventual complete mall against the
  original at representative close-up cameras before switching the default scene.
- Qualify large-scene batching, frame timing and graphics tiers on real integrated
  GPUs and capable devices; software-rendered previews do not establish that result.

These stages are not claimed complete by the existence of component filenames
or successful standalone previews.
