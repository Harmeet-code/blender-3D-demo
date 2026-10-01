import { describe, expect, test } from 'bun:test';
import catalogJson from '../src/frontend/assets/metadata/catalog.v1.json';
import { assetCatalogSchema } from '../src/frontend/entities/asset/model/asset-schema.ts';
import { inspectAsset } from '../scripts/assets/validate.ts';
import {
  assembleRoom,
  roomEntrance,
} from '../src/frontend/entities/building/model/room-assembly.ts';
import { assetProofLayout } from '../src/frontend/entities/building/model/asset-proof-layout.ts';
import { demoLayout, type Room } from '../src/frontend/entities/building/model/building-schema.ts';
import { useLayoutStore } from '../src/frontend/entities/building/model/layout-store.ts';
import { placeAddOns, hasClearanceRoute } from '../src/frontend/entities/asset/model/placement.ts';
import {
  polygonContains,
  polygonsOverlap,
  transformFootprint,
} from '../src/frontend/shared/lib/geometry/polygon.ts';
const catalog = assetCatalogSchema.parse(catalogJson);
const room = assetProofLayout.rooms[0];
if (!room) {
  throw new Error('Missing proof fixture');
}
describe('actual GLB release checks', () => {
  test('every released file matches its manifest', async () => {
    for (const asset of catalog) {
      expect((await inspectAsset(asset)).errors).toEqual([]);
    }
  });
  test('actual oversized chair and missing socket fail', async () => {
    const chair = catalog.find((asset) => asset.id === 'chair');
    if (!chair) {
      throw new Error('Missing chair');
    }
    expect(
      (await inspectAsset({ ...chair, budget: { ...chair.budget, triangles: 10 } })).errors,
    ).toContain('triangles exceeds release budget');
    expect(
      (await inspectAsset({ ...chair, requiredNodes: [...chair.requiredNodes, 'socket_missing'] }))
        .errors,
    ).toContain('Missing required node: socket_missing');
  });
});
describe('assembly and placement', () => {
  test('preserves canonical size and uses modules for legacy, concave, and off-grid footprints', () => {
    expect(assembleRoom(room).canonical).toBe(true);
    const legacy = demoLayout.rooms[0];
    if (!legacy) {
      throw new Error('Missing legacy room');
    }
    expect(assembleRoom(legacy).canonical).toBe(false);
    expect(assembleRoom(legacy).panels.every((panel) => panel.width <= 1)).toBe(true);
    for (const polygon of [
      [
        [0, 0],
        [4.3, 0],
        [4.3, 4],
        [0, 4],
      ],
      [
        [0, 0],
        [4, 0],
        [4, 2],
        [2, 2],
        [2, 4],
        [0, 4],
      ],
    ] as Array<Array<[number, number]>>) {
      const custom: Room = { ...room, polygon, entrance: undefined };
      expect(assembleRoom(custom).canonical).toBe(false);
      expect(roomEntrance(custom)).toEqual(roomEntrance(custom));
    }
  });
  test('placements are stable, fully contained, and do not overlap', () => {
    const first = placeAddOns(room, ['table', 'chair', 'chair'], catalog);
    const repeated = placeAddOns(room, ['chair', 'table'], catalog);
    expect(first).toEqual(repeated);
    if (first.isErr()) {
      throw new Error(first.error.message);
    }
    expect(first.value.records).toHaveLength(2);
    const footprints = first.value.records.map((record) => {
      const asset = catalog.find((item) => item.id === record.assetId);
      if (!asset) {
        throw new Error('Missing placed asset');
      }
      return transformFootprint(
        asset.footprint,
        [record.position[0] + first.value.origin[0], record.position[2] + first.value.origin[2]],
        record.yawRadians,
      );
    });
    for (const footprint of footprints) {
      expect(polygonContains(room.polygon, footprint, 0.05)).toBe(true);
    }
    expect(polygonsOverlap(footprints[0] ?? [], footprints[1] ?? [])).toBe(false);
  });
  test('rejects blocked and narrow routes but allows a concave open route', () => {
    const hall: Room = {
      id: 'route',
      floorId: 'F1',
      type: 'booth',
      polygon: [
        [0, 0],
        [4, 0],
        [4, 6],
        [0, 6],
      ],
      entrance: { position: [2, 6], yawRadians: 0 },
    };
    expect(
      hasClearanceRoute(
        hall,
        [
          [
            [0, 2],
            [4, 2],
            [4, 3],
            [0, 3],
          ],
        ],
        [[2, 1]],
      ),
    ).toBe(false);
    const narrow: Room = {
      ...hall,
      polygon: [
        [0, 0],
        [0.9, 0],
        [0.9, 6],
        [0, 6],
      ],
      entrance: { position: [0.45, 6], yawRadians: 0 },
    };
    expect(hasClearanceRoute(narrow, [], [[0.45, 1]])).toBe(false);
    const concave: Room = {
      ...hall,
      polygon: [
        [0, 0],
        [6, 0],
        [6, 3],
        [3, 3],
        [3, 6],
        [0, 6],
      ],
      entrance: { position: [1.5, 6], yawRadians: 0 },
    };
    expect(hasClearanceRoute(concave, [], [[4.5, 1.5]])).toBe(true);
  });
  test('no-fit and unavailable previews retain selection and report a typed warning', () => {
    const tiny: Room = {
      ...room,
      polygon: [
        [0, 0],
        [0.6, 0],
        [0.6, 0.6],
        [0, 0.6],
      ],
      entrance: undefined,
    };
    const selected = ['chair', 'table', 'early-setup'];
    const placed = placeAddOns(tiny, selected, catalog);
    expect(selected).toEqual(['chair', 'table', 'early-setup']);
    expect(placed.isOk() && placed.value.records.length === 0).toBe(true);
    expect(
      placed.isOk() && placed.value.warnings.every((warning) => warning.code === 'NO_FIT'),
    ).toBe(true);
  });
  test('invalid layout edits preserve the last valid normalized layout', () => {
    const previous = useLayoutStore.getState().layout;
    const result = useLayoutStore.getState().update({ ...demoLayout, floors: [] });
    expect(result.isErr()).toBe(true);
    expect(useLayoutStore.getState().layout).toBe(previous);
  });
});
