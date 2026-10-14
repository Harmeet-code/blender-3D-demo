import type { ReactNode } from 'react';
import baseCatalog from '@/assets/metadata/catalog.v1.json';
import sizedBooths from '@/assets/metadata/booth-sizes.v1.json';
import { expansionAssetMetadata } from '@/features/assets/model/expansion-metadata.ts';
import { catalogObjectComponents, catalogObjectFiles } from './catalog/catalog.ts';
import {
  SUV,
  Sedan,
  ElectricCar,
  PickupTruck,
  UtilityVan,
  EstateCar,
  Chair,
  Sofa,
  Table,
  Bench,
  Planter,
  Escalator,
  Staircase,
  ElevatorEntrance,
  GlassBalustrade,
  Bollard,
  FireExtinguisher,
  SlattedConsole,
  PendantLight,
} from './index.ts';

export interface ObjectPreviewOptions {
  detail: 'baseline' | 'low';
  color?: string;
}
export interface ReusableObjectEntry {
  id: string;
  label: string;
  family: string;
  component: string;
  viewDirection?: [number, number, number];
  supportsColor?: boolean;
  render(options: ObjectPreviewOptions): ReactNode;
}

const native: ReusableObjectEntry[] = [
  {
    id: 'luminary-suv',
    label: 'SUV',
    family: 'Vehicles',
    component: 'vehicles/SUV.tsx',
    render: ({ detail, color }) => <SUV detail={detail === 'low' ? 'low' : 'high'} paint={color} />,
  },
  {
    id: 'luminary-sedan',
    label: 'Sedan',
    family: 'Vehicles',
    component: 'vehicles/Sedan.tsx',
    render: ({ detail, color }) => (
      <Sedan detail={detail === 'low' ? 'low' : 'high'} paint={color} />
    ),
  },
  {
    id: 'luminary-electric-car',
    label: 'Electric car',
    family: 'Vehicles',
    component: 'vehicles/ElectricCar.tsx',
    render: ({ detail, color }) => (
      <ElectricCar detail={detail === 'low' ? 'low' : 'high'} paint={color} />
    ),
  },
  {
    id: 'luminary-pickup',
    label: 'Pickup truck',
    family: 'Vehicles',
    component: 'vehicles/PickupTruck.tsx',
    render: ({ detail, color }) => (
      <PickupTruck detail={detail === 'low' ? 'low' : 'high'} paint={color} />
    ),
  },
  {
    id: 'luminary-van',
    label: 'Utility van',
    family: 'Vehicles',
    component: 'vehicles/UtilityVan.tsx',
    render: ({ detail, color }) => (
      <UtilityVan detail={detail === 'low' ? 'low' : 'high'} paint={color} />
    ),
  },
  {
    id: 'luminary-estate',
    label: 'Estate car',
    family: 'Vehicles',
    component: 'vehicles/EstateCar.tsx',
    render: ({ detail, color }) => (
      <EstateCar detail={detail === 'low' ? 'low' : 'high'} paint={color} />
    ),
  },
  {
    id: 'luminary-chair',
    label: 'Lounge chair',
    family: 'Furniture',
    component: 'furniture/Chair.tsx',
    render: ({ detail, color }) => <Chair detail={detail} upholsteryColor={color} />,
  },
  {
    id: 'luminary-sofa',
    label: 'Lounge sofa',
    family: 'Furniture',
    component: 'furniture/Sofa.tsx',
    render: ({ detail, color }) => <Sofa detail={detail} upholsteryColor={color} />,
  },
  {
    id: 'luminary-table',
    label: 'Travertine table',
    family: 'Furniture',
    component: 'furniture/Table.tsx',
    render: ({ detail, color }) => <Table detail={detail} topColor={color} />,
  },
  {
    id: 'luminary-bench',
    label: 'Oak bench',
    family: 'Furniture',
    component: 'furniture/Bench.tsx',
    render: ({ detail, color }) => <Bench detail={detail} woodColor={color} />,
  },
  {
    id: 'luminary-planter',
    label: 'Olive planter',
    family: 'Furniture',
    component: 'furniture/Planter.tsx',
    render: ({ detail, color }) => <Planter detail={detail} potColor={color} />,
  },
  {
    id: 'luminary-console',
    label: 'Slatted console',
    family: 'Furniture',
    component: 'fixtures/SlattedConsole.tsx',
    render: ({ detail }) => <SlattedConsole detail={detail} />,
  },
  {
    id: 'luminary-escalator',
    label: 'Escalator',
    family: 'Circulation',
    component: 'circulation/Escalator.tsx',
    viewDirection: [1.4, 0.85, -1.8],
    render: ({ detail }) => (
      <Escalator detail={detail} rise={4.4} run={9.5} width={2.1} landingLength={0.7} />
    ),
  },
  {
    id: 'luminary-staircase',
    label: 'Staircase',
    family: 'Circulation',
    component: 'circulation/Staircase.tsx',
    viewDirection: [1.4, 0.85, -1.8],
    render: ({ detail }) => <Staircase detail={detail} />,
  },
  {
    id: 'luminary-elevator',
    label: 'Elevator entrance',
    family: 'Circulation',
    component: 'circulation/ElevatorEntrance.tsx',
    render: ({ detail }) => <ElevatorEntrance detail={detail} />,
  },
  {
    id: 'luminary-balustrade',
    label: 'Glass balustrade',
    family: 'Circulation',
    component: 'circulation/GlassBalustrade.tsx',
    render: ({ detail }) => <GlassBalustrade detail={detail} />,
  },
  {
    id: 'luminary-bollard',
    label: 'Arrival bollard',
    family: 'Fixtures',
    component: 'fixtures/Bollard.tsx',
    render: ({ color }) => <Bollard color={color} />,
  },
  {
    id: 'luminary-extinguisher',
    label: 'Fire extinguisher',
    family: 'Fixtures',
    component: 'fixtures/FireExtinguisher.tsx',
    render: () => <FireExtinguisher />,
  },
  {
    id: 'luminary-pendant',
    label: 'Opal pendant',
    family: 'Fixtures',
    component: 'fixtures/PendantLight.tsx',
    render: () => <PendantLight />,
  },
];
const metadata = [...baseCatalog, ...sizedBooths, ...expansionAssetMetadata];
const customColorIds = new Set([
  'luminary-suv',
  'luminary-sedan',
  'luminary-electric-car',
  'luminary-pickup',
  'luminary-van',
  'luminary-estate',
  'luminary-chair',
  'luminary-sofa',
  'luminary-table',
  'luminary-bench',
  'luminary-planter',
  'luminary-bollard',
]);
function primaryMaterial(id: string) {
  const item = metadata.find((record) => record.id === id);
  const roles =
    item && 'materialRoles' in item ? Object.keys(item.materialRoles) : ['finish_panel'];
  return (
    [
      'finish_panel',
      'finish_chair',
      'finish_wood',
      'finish_yellow',
      'finish_floor',
      'finish_branding',
    ].find((name) => roles.includes(name)) ??
    roles[0] ??
    'finish_panel'
  );
}
export const reusableObjects: readonly ReusableObjectEntry[] = [
  ...native.map((entry) => ({ ...entry, supportsColor: customColorIds.has(entry.id) })),
  ...Object.entries(catalogObjectComponents).map(([id, Component]) => ({
    id,
    label: metadata.find((item) => item.id === id)?.label ?? id,
    family: id.startsWith('booth-')
      ? 'Booths'
      : id.startsWith('shell-')
        ? 'Architecture'
        : 'Venue assets',
    component: `catalog/${catalogObjectFiles[id]}`,
    supportsColor: true,
    render: ({ detail, color }: ObjectPreviewOptions) => (
      <Component
        detail={detail}
        surfaces={color ? { [primaryMaterial(id)]: { color } } : undefined}
      />
    ),
  })),
];
