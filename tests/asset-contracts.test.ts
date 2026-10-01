import { describe, expect, test } from 'bun:test';
import { assetMetadataSchema } from '../src/frontend/entities/asset/model/asset-schema.ts';
import { ADD_ON_VISUALS } from '../src/frontend/entities/asset/model/add-on-visuals.ts';
import {
  BOOTH_ADD_ONS,
  buildingLayoutSchema,
  demoLayout,
} from '../src/frontend/entities/building/model/building-schema.ts';
import { normalizeLayout } from '../src/frontend/entities/building/model/normalize-layout.ts';
import { polygonContains } from '../src/frontend/shared/lib/geometry/polygon.ts';

export const validChair = {
  id: 'chair',
  version: 1,
  label: 'Chair',
  anchor: 'floor-contact',
  facing: '+Z',
  dimensions: [0.5, 0.85, 0.55],
  bounds: { min: [-0.25, 0, -0.275], max: [0.25, 0.85, 0.275] },
  footprint: [
    [-0.25, -0.275],
    [0.25, -0.275],
    [0.25, 0.275],
    [-0.25, 0.275],
  ],
  requiredNodes: ['root'],
  materialRoles: { surface: 'surface' },
  sockets: {},
  colliders: [{ halfExtents: [0.25, 0.425, 0.275], position: [0, 0.425, 0], rotation: [0, 0, 0] }],
  source: {
    blend: 'assets-source/blender/chair/chair.blend',
    recipe: 'assets-source/blender/build.py',
    license: 'CC0-1.0',
    generatorVersion: '1.0.0',
  },
  budget: { triangles: 800, materials: 1, bytes: 1048576, textureSize: 1024 },
  metrics: { triangles: 120, materials: 1, bytes: 12000, textureBytes: 0 },
};

describe('asset interface', () => {
  test('accepts a measured source and export contract', () => {
    expect(assetMetadataSchema.safeParse(validChair).success).toBe(true);
  });
  test('rejects over-budget geometry, wrong bounds, ground offsets, and undeclared sockets', () => {
    for (const changed of [
      { ...validChair, metrics: { ...validChair.metrics, triangles: 801 } },
      { ...validChair, dimensions: [1, 0.85, 0.55] },
      { ...validChair, bounds: { ...validChair.bounds, min: [-0.25, 0.1, -0.275] } },
      { ...validChair, sockets: { socket_branding: { position: [0, 1, 0], rotation: [0, 0, 0] } } },
    ]) {
      expect(assetMetadataSchema.safeParse(changed).success).toBe(false);
    }
  });
  test('maps every existing catalog ID and distinguishes services', () => {
    for (const addOn of BOOTH_ADD_ONS) {
      expect(ADD_ON_VISUALS[addOn.id]).toBeDefined();
    }
    expect(ADD_ON_VISUALS['forklift-service']?.kind).toBe('logistics');
    expect(ADD_ON_VISUALS['visa-letter']?.kind).toBe('nonvisual');
  });
});

describe('layout calibration and integrity', () => {
  test('normalizes image coordinates once and converts room, portal, and logistics anchors', () => {
    const layout = {
      ...demoLayout,
      floors: demoLayout.floors.map((f) =>
        f.id === 'F1'
          ? {
              ...f,
              coordinateSystem: { units: 'pixels', origin: [100, 100], metersPerPixel: 0.01 },
              logisticsAnchors: [
                { id: 'loading', position: [600, 600], yawRadians: 0, assetId: 'pallet' },
              ],
            }
          : f,
      ),
      rooms: [
        {
          id: 'pixel-room',
          floorId: 'F1',
          type: 'booth',
          polygon: [
            [100, 100],
            [500, 100],
            [500, 500],
            [100, 500],
          ],
          entrance: { position: [300, 500], yawRadians: 0 },
        },
      ],
      portals: [
        {
          id: 'lift',
          type: 'elevator',
          connects: ['B1', 'F1'],
          entries: [{ floorId: 'F1', position: [200, 300], yawRadians: 0 }],
        },
      ],
    };
    const result = normalizeLayout(layout);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.rooms[0]?.polygon).toEqual([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ]);
    expect(result.value.rooms[0]?.entrance?.position).toEqual([2, 4]);
    expect(result.value.portals[0]?.entries?.[0]?.position).toEqual([1, 2]);
    expect(result.value.floors[1]?.logisticsAnchors?.[0]?.position).toEqual([5, 5]);
    expect(normalizeLayout(result.value).isErr()).toBe(true);
  });
  test('preserves legacy meter and off-grid polygons and floor heights', () => {
    const result = normalizeLayout(demoLayout);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.rooms[0]?.polygon).toEqual(demoLayout.rooms[0]?.polygon);
      expect(result.value.floors[0]?.heightOffset).toBe(-4);
    }
    const offGrid = {
      ...demoLayout,
      rooms: [
        {
          id: 'off-grid',
          floorId: 'F1',
          polygon: [
            [0, 0],
            [4.3, 0],
            [4.3, 4],
            [0, 4],
          ],
        },
      ],
    };
    expect(normalizeLayout(offGrid).isOk()).toBe(true);
  });
  test('rejects invalid calibration, dangling references, duplicate IDs, and invalid polygons', () => {
    const variants = [
      {
        ...demoLayout,
        floors: [
          {
            ...demoLayout.floors[0],
            coordinateSystem: { units: 'pixels', origin: [0, 0], metersPerPixel: 0 },
          },
        ],
      },
      {
        ...demoLayout,
        rooms: [
          {
            id: 'x',
            floorId: 'missing',
            polygon: [
              [0, 0],
              [4, 0],
              [4, 4],
            ],
          },
        ],
      },
      { ...demoLayout, rooms: [demoLayout.rooms[0], demoLayout.rooms[0]] },
      {
        ...demoLayout,
        rooms: [
          {
            id: 'x',
            floorId: 'F1',
            polygon: [
              [0, 0],
              [4, 4],
              [0, 4],
              [4, 0],
            ],
          },
        ],
      },
      {
        ...demoLayout,
        rooms: [
          {
            id: 'x',
            floorId: 'F1',
            polygon: [
              [0, 0],
              [1, 0],
              [2, 0],
            ],
          },
        ],
      },
      { ...demoLayout, floors: demoLayout.floors.map((f) => ({ ...f, heightOffset: Infinity })) },
    ];
    for (const input of variants) {
      expect(buildingLayoutSchema.safeParse(input).success).toBe(false);
    }
  });
  test('rejects a footprint crossing a concave boundary although its corners are inside', () => {
    const room: [number, number][] = [
      [0, 0],
      [6, 0],
      [6, 6],
      [4, 6],
      [4, 2],
      [2, 2],
      [2, 6],
      [0, 6],
    ];
    expect(
      polygonContains(
        room,
        [
          [1, 3],
          [5, 3],
          [5, 4],
          [1, 4],
        ],
        0.05,
      ),
    ).toBe(false);
    expect(
      polygonContains(
        room,
        [
          [0.5, 0.5],
          [1.5, 0.5],
          [1.5, 1.5],
          [0.5, 1.5],
        ],
        0.05,
      ),
    ).toBe(true);
  });
});
