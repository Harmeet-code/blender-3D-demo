import type { ComponentType } from 'react';
import type { CatalogObjectProps } from './CatalogObject.tsx';
import { BannerStand } from './BannerStand.tsx';
import { BoothCeiling } from './BoothCeiling.tsx';
import { BoothFrame } from './BoothFrame.tsx';
import { ExhibitionChair } from './ExhibitionChair.tsx';
import { DisplayCase } from './DisplayCase.tsx';
import { CatalogElevatorEntrance } from './CatalogElevatorEntrance.tsx';
import { EscalatorEntrance } from './EscalatorEntrance.tsx';
import { FloorTile } from './FloorTile.tsx';
import { Forklift } from './Forklift.tsx';
import { Pallet } from './Pallet.tsx';
import { Safe } from './Safe.tsx';
import { Stairs } from './Stairs.tsx';
import { ExhibitionTable } from './ExhibitionTable.tsx';
import { WallPanel } from './WallPanel.tsx';
import { Booth10x10 } from './Booth10x10.tsx';
import { Booth28x10 } from './Booth28x10.tsx';
import { Booth28x36 } from './Booth28x36.tsx';
import { Booth28x54 } from './Booth28x54.tsx';
import { Booth27x50 } from './Booth27x50.tsx';
import { Booth20x20 } from './Booth20x20.tsx';
import { Booth14x38 } from './Booth14x38.tsx';
import { Booth40x45 } from './Booth40x45.tsx';
import { InfoDesk } from './InfoDesk.tsx';
import { Podium } from './Podium.tsx';
import { QueueRail } from './QueueRail.tsx';
import { SquarePlanter } from './SquarePlanter.tsx';
import { ModularBench } from './ModularBench.tsx';
import { TrashBin } from './TrashBin.tsx';
import { FoodKiosk } from './FoodKiosk.tsx';
import { WashroomSign } from './WashroomSign.tsx';
import { ExitSign } from './ExitSign.tsx';
import { AtmSign } from './AtmSign.tsx';
import { DoorSingle } from './DoorSingle.tsx';
import { DoorDouble } from './DoorDouble.tsx';
import { Ramp } from './Ramp.tsx';
import { ShellSlab } from './ShellSlab.tsx';
import { ShellColumn } from './ShellColumn.tsx';
import { ShellBeam } from './ShellBeam.tsx';
import { ShellFacadePanel } from './ShellFacadePanel.tsx';
import { ShellCurtainWall } from './ShellCurtainWall.tsx';
import { ShellRoofFlat } from './ShellRoofFlat.tsx';
import { ShellCanopy } from './ShellCanopy.tsx';
import { ParkingBay } from './ParkingBay.tsx';
import { ParkingAccessible } from './ParkingAccessible.tsx';
import { RoadSegment } from './RoadSegment.tsx';
import { Crosswalk } from './Crosswalk.tsx';
import { EvCharger } from './EvCharger.tsx';

export const catalogObjectComponents: Readonly<Record<string, ComponentType<CatalogObjectProps>>> =
  {
    'banner-stand': BannerStand,
    'booth-ceiling': BoothCeiling,
    'booth-frame': BoothFrame,
    chair: ExhibitionChair,
    'display-case': DisplayCase,
    'elevator-entrance': CatalogElevatorEntrance,
    'escalator-entrance': EscalatorEntrance,
    'floor-tile': FloorTile,
    forklift: Forklift,
    pallet: Pallet,
    safe: Safe,
    stairs: Stairs,
    table: ExhibitionTable,
    'wall-panel': WallPanel,
    'booth-10x10': Booth10x10,
    'booth-28x10': Booth28x10,
    'booth-28x36': Booth28x36,
    'booth-28x54': Booth28x54,
    'booth-27x50': Booth27x50,
    'booth-20x20': Booth20x20,
    'booth-14x38': Booth14x38,
    'booth-40x45': Booth40x45,
    'info-desk': InfoDesk,
    podium: Podium,
    'queue-rail': QueueRail,
    planter: SquarePlanter,
    bench: ModularBench,
    'trash-bin': TrashBin,
    'food-kiosk': FoodKiosk,
    'washroom-sign': WashroomSign,
    'exit-sign': ExitSign,
    'atm-sign': AtmSign,
    'door-single': DoorSingle,
    'door-double': DoorDouble,
    ramp: Ramp,
    'shell-slab': ShellSlab,
    'shell-column': ShellColumn,
    'shell-beam': ShellBeam,
    'shell-facade-panel': ShellFacadePanel,
    'shell-curtain-wall': ShellCurtainWall,
    'shell-roof-flat': ShellRoofFlat,
    'shell-canopy': ShellCanopy,
    'parking-bay': ParkingBay,
    'parking-accessible': ParkingAccessible,
    'road-segment': RoadSegment,
    crosswalk: Crosswalk,
    'ev-charger': EvCharger,
  };
export const catalogObjectFiles: Readonly<Record<string, string>> = {
  'banner-stand': 'BannerStand.tsx',
  'booth-ceiling': 'BoothCeiling.tsx',
  'booth-frame': 'BoothFrame.tsx',
  chair: 'ExhibitionChair.tsx',
  'display-case': 'DisplayCase.tsx',
  'elevator-entrance': 'CatalogElevatorEntrance.tsx',
  'escalator-entrance': 'EscalatorEntrance.tsx',
  'floor-tile': 'FloorTile.tsx',
  forklift: 'Forklift.tsx',
  pallet: 'Pallet.tsx',
  safe: 'Safe.tsx',
  stairs: 'Stairs.tsx',
  table: 'ExhibitionTable.tsx',
  'wall-panel': 'WallPanel.tsx',
  'booth-10x10': 'Booth10x10.tsx',
  'booth-28x10': 'Booth28x10.tsx',
  'booth-28x36': 'Booth28x36.tsx',
  'booth-28x54': 'Booth28x54.tsx',
  'booth-27x50': 'Booth27x50.tsx',
  'booth-20x20': 'Booth20x20.tsx',
  'booth-14x38': 'Booth14x38.tsx',
  'booth-40x45': 'Booth40x45.tsx',
  'info-desk': 'InfoDesk.tsx',
  podium: 'Podium.tsx',
  'queue-rail': 'QueueRail.tsx',
  planter: 'SquarePlanter.tsx',
  bench: 'ModularBench.tsx',
  'trash-bin': 'TrashBin.tsx',
  'food-kiosk': 'FoodKiosk.tsx',
  'washroom-sign': 'WashroomSign.tsx',
  'exit-sign': 'ExitSign.tsx',
  'atm-sign': 'AtmSign.tsx',
  'door-single': 'DoorSingle.tsx',
  'door-double': 'DoorDouble.tsx',
  ramp: 'Ramp.tsx',
  'shell-slab': 'ShellSlab.tsx',
  'shell-column': 'ShellColumn.tsx',
  'shell-beam': 'ShellBeam.tsx',
  'shell-facade-panel': 'ShellFacadePanel.tsx',
  'shell-curtain-wall': 'ShellCurtainWall.tsx',
  'shell-roof-flat': 'ShellRoofFlat.tsx',
  'shell-canopy': 'ShellCanopy.tsx',
  'parking-bay': 'ParkingBay.tsx',
  'parking-accessible': 'ParkingAccessible.tsx',
  'road-segment': 'RoadSegment.tsx',
  crosswalk: 'Crosswalk.tsx',
  'ev-charger': 'EvCharger.tsx',
};
