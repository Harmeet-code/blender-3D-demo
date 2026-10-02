import { demoLayout, type BuildingLayout } from './building-schema.ts';
import { normalizeLayout } from './normalize-layout.ts';
export const stressSource: BuildingLayout = {
  ...demoLayout,
  buildingId: 'venue-stress-v1',
  floors: demoLayout.floors.map((floor) => ({
    ...floor,
    coordinateSystem: { units: 'meters' },
    logisticsAnchors: [
      { id: `${floor.id}-forklift`, assetId: 'forklift', position: [-16, 12], yawRadians: 0 },
      { id: `${floor.id}-pallet`, assetId: 'pallet', position: [-12, 12], yawRadians: 0 },
    ],
  })),
  rooms: demoLayout.floors.flatMap((floor) =>
    Array.from({ length: 20 }, (_, i) => {
      const x = -16 + (i % 5) * 6.5,
        z = -12 + Math.floor(i / 5) * 5.5;
      return {
        id: `${floor.id}-booth-${String(i + 1).padStart(2, '0')}`,
        floorId: floor.id,
        type: 'booth' as const,
        polygon: [
          [x, z],
          [x + 4, z],
          [x + 4, z + 4],
          [x, z + 4],
        ] as Array<[number, number]>,
        entrance: { position: [x + 2, z + 4] as [number, number], yawRadians: 0 },
      };
    }),
  ),
  portals: [
    {
      id: 'lift-01',
      type: 'elevator',
      connects: ['B1', 'F1'],
      entries: demoLayout.floors.map((f) => ({
        floorId: f.id,
        position: [-23, 3] as [number, number],
        yawRadians: 0,
      })),
    },
    ...(['stairs', 'escalator'] as const).map((type, i) => ({
      id: `${type}-01`,
      type,
      connects: ['B1', 'F1'],
      entries: [
        { floorId: 'B1', position: [23 + i * 4, 10] as [number, number], yawRadians: 0 },
        { floorId: 'F1', position: [23 + i * 4, 3] as [number, number], yawRadians: 0 },
      ],
    })),
  ],
};
const result = normalizeLayout(stressSource);
if (result.isErr()) {
  throw new Error(result.error.message);
}
export const assetStressLayout = result.value;
