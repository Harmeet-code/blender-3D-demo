import { describe, expect, test } from 'bun:test';
import { assembleRoom } from '../src/frontend/entities/building/model/room-assembly.ts';
import { transformFootprint } from '../src/frontend/shared/lib/geometry/polygon.ts';
import { reexpressFloor } from '../src/frontend/entities/building/model/reexpress-floor.ts';
import { normalizeLayout } from '../src/frontend/entities/building/model/normalize-layout.ts';
import {
  assetStressLayout,
  stressSource,
} from '../src/frontend/entities/building/model/asset-stress-layout.ts';
import { portalPlacements } from '../src/frontend/entities/building/model/portal-placement.ts';
import { placeAddOns, placeLogistics } from '../src/frontend/entities/asset/model/placement.ts';
import { assetCatalogSchema } from '../src/frontend/entities/asset/model/asset-schema.ts';
import catalogJson from '../src/frontend/assets/metadata/catalog.v1.json';
const catalog = assetCatalogSchema.parse(catalogJson);
describe('reference venue and portal compatibility', () => {
  test('changing editor coordinate units preserves room, entrance, service, and portal meter positions', () => {
    const converted = reexpressFloor(stressSource, 'F1', {
      units: 'pixels',
      metersPerPixel: 0.025,
      origin: [100, 200],
    });
    expect(converted.isOk()).toBe(true);
    if (converted.isErr()) {
      throw new Error(converted.error.message);
    }
    const normalized = normalizeLayout(converted.value);
    expect(normalized.isOk()).toBe(true);
    if (normalized.isErr()) {
      throw new Error(normalized.error.message);
    }
    expect(normalized.value.rooms).toEqual(assetStressLayout.rooms);
    expect(normalized.value.portals).toEqual(assetStressLayout.portals);
    expect(normalized.value.floors.map((floor) => floor.logisticsAnchors)).toEqual(
      assetStressLayout.floors.map((floor) => floor.logisticsAnchors),
    );
    expect(normalized.value.floors.map((floor) => floor.heightOffset)).toEqual([-4, 0]);
  });

  test('logistics anchors cannot place forklifts inside booths or declared walkways', () => {
    const floor = assetStressLayout.floors.find((item) => item.id === 'F1');
    const booth = assetStressLayout.rooms.find((item) => item.floorId === 'F1');
    if (!floor || !booth) {
      throw new Error('Missing reference floor');
    }
    const valid = placeLogistics(
      floor,
      assetStressLayout.rooms.filter((item) => item.floorId === floor.id),
      ['forklift', 'pallet'],
      catalog,
    );
    expect(valid.isOk() && valid.value.anchors.length === 2).toBe(true);
    const blockedFloor = {
      ...floor,
      logisticsAnchors: [
        {
          id: 'bad',
          assetId: 'forklift' as const,
          position: [-14, -10] as [number, number],
          yawRadians: 0,
        },
      ],
    };
    for (const type of ['booth', 'walkable', 'hall'] as const) {
      const blocked = placeLogistics(blockedFloor, [{ ...booth, type }], ['forklift'], catalog);
      expect(blocked.isOk() && blocked.value.anchors.length === 0).toBe(true);
      expect(blocked.isOk() && blocked.value.warnings[0]?.code).toBe('NO_FIT');
    }
  });

  test('a rotated four-meter room keeps its canonical frame orientation', () => {
    const yaw = Math.PI / 2;
    const base = assetStressLayout.rooms[0];
    if (!base) {
      throw new Error('Missing reference room');
    }
    const room = {
      ...base,
      polygon: transformFootprint(
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
        ],
        [0, 0],
        yaw,
      ),
      entrance: { position: [4, -2] as [number, number], yawRadians: yaw },
    };
    const assembly = assembleRoom(room);
    expect(assembly.canonical).toBe(true);
    expect(assembly.entrance.yawRadians).toBe(yaw);
  });

  test('contains forty deterministic booths and valid full flights', () => {
    expect(assetStressLayout.rooms).toHaveLength(40);
    for (const floor of assetStressLayout.floors) {
      const rooms = assetStressLayout.rooms.filter((room) => room.floorId === floor.id);
      expect(rooms).toHaveLength(20);
      for (const room of rooms) {
        const result = placeAddOns(room, ['chair', 'table', 'display-case'], catalog);
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value.warnings).toEqual([]);
          expect(result.value.records).toHaveLength(3);
        }
      }
    }
    const plan = portalPlacements(assetStressLayout);
    expect(plan.warnings).toEqual([]);
    expect(plan.records).toHaveLength(4);
  });
  test('missing entries and 3 m rise suppress visuals without altering graph', () => {
    const legacy = {
      ...assetStressLayout,
      portals: assetStressLayout.portals.map((p) => ({ ...p, entries: undefined })),
    };
    expect(portalPlacements(legacy).records).toHaveLength(0);
    expect(legacy.portals.map((p) => p.connects)).toEqual(
      assetStressLayout.portals.map((p) => p.connects),
    );
    const mismatch = {
      ...assetStressLayout,
      floors: assetStressLayout.floors.map((f) => (f.id === 'B1' ? { ...f, heightOffset: -3 } : f)),
    };
    expect(portalPlacements(mismatch).records.every((p) => p.assetId === 'elevator-entrance')).toBe(
      true,
    );
    expect(portalPlacements(mismatch).warnings).toHaveLength(2);
  });
  test('opposite yaw is rejected even when landing centers match', () => {
    const mismatch = {
      ...assetStressLayout,
      portals: assetStressLayout.portals.map((p) =>
        p.type === 'stairs'
          ? {
              ...p,
              entries: p.entries?.map((e) =>
                e.floorId === 'F1' ? { ...e, yawRadians: Math.PI } : e,
              ),
            }
          : p,
      ),
    };
    expect(
      portalPlacements(mismatch).warnings.some((message) => message.includes('orientation')),
    ).toBe(true);
  });
});
