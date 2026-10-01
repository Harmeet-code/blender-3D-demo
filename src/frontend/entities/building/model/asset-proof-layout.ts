import type { BuildingLayout } from './building-schema.ts';
import { demoLayout } from './building-schema.ts';
import { normalizeLayout } from './normalize-layout.ts';
const proof: BuildingLayout = {
  ...demoLayout,
  rooms: demoLayout.floors.flatMap((floor) => [
    {
      id: `${floor.id}-proof-a`,
      floorId: floor.id,
      type: 'booth' as const,
      polygon: [
        [-5, 0],
        [-1, 0],
        [-1, 4],
        [-5, 4],
      ] as Array<[number, number]>,
      entrance: { position: [-3, 4] as [number, number], yawRadians: 0 },
    },
    {
      id: `${floor.id}-proof-b`,
      floorId: floor.id,
      type: 'booth' as const,
      polygon: [
        [1, 0],
        [5, 0],
        [5, 4],
        [1, 4],
      ] as Array<[number, number]>,
      entrance: { position: [3, 4] as [number, number], yawRadians: 0 },
    },
  ]),
};
const normalized = normalizeLayout(proof);
if (normalized.isErr()) {
  throw new Error(normalized.error.message);
}
export const assetProofLayout = normalized.value;
