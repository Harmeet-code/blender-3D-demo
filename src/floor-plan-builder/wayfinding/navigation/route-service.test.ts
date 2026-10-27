import { describe, expect, test } from 'bun:test';
import { createObject } from '../../model/inventory.ts';
import type { PlanDocument } from '../../model/types.ts';
import {
  describeRoute,
  invalidConnectorLandings,
  itemAccessPoint,
  planWayfindingRoute,
  resolveEndpoint,
} from './route-service.ts';
import type { PlanRoute } from '../../model/directions.ts';
import type { WalkableZone } from '../model/zone-schema.ts';

function documentWith(objects: ReturnType<typeof createObject>[]): PlanDocument {
  return {
    baseline: { buildingId: 'test', schemaVersion: 2, floors: [], rooms: [], portals: [] },
    floors: [
      {
        source: {
          id: 'f1',
          name: 'Ground',
          heightOffset: 0,
          image: '',
          coordinateSystem: { units: 'meters' },
          calibrationStatus: 'confirmed',
        },
        boundary: [
          [-10, -10],
          [10, -10],
          [10, 10],
          [-10, 10],
        ],
        spawn: [0, 0],
        objects,
        zones: [],
      },
    ],
  } as unknown as PlanDocument;
}

const walkableZone = (
  floorId = 'f1',
  polygon: [number, number][] = [
    [-9, -9],
    [9, -9],
    [9, 9],
    [-9, 9],
  ],
): WalkableZone => ({
  id: `walk-${floorId}`,
  floorId,
  name: 'Main walkable area',
  type: 'general',
  polygon,
  holes: [],
  revision: 0,
});

describe('itemAccessPoint', () => {
  test('booth resolves to an open edge, never the centre', () => {
    const booth = { ...createObject('booth', [3, 4]), position: [3, 4] as [number, number] };
    const point = itemAccessPoint(booth);
    expect(point).not.toEqual([3, 4]);
  });

  test('exit resolves to its sink target', () => {
    const exit = { ...createObject('exit', [1, 2]), position: [1, 2] as [number, number] };
    expect(itemAccessPoint(exit)).toEqual([1, 2.5]);
  });

  test('kiosk resolves into its queue front', () => {
    const kiosk = { ...createObject('food-kiosk', [0, 0]), position: [0, 0] as [number, number] };
    const point = itemAccessPoint(kiosk);
    expect(point[1]).toBeGreaterThan(1);
  });
});

describe('resolveEndpoint', () => {
  test('rejects point endpoints inside obstacles instead of silently moving them', () => {
    const booth = { ...createObject('booth', [0, -3]), position: [0, -3] as [number, number] };
    const document = documentWith([booth]);
    const resolved = resolveEndpoint(document, { floorId: 'f1', kind: 'point', point: [0, -4.5] }, [
      walkableZone(),
    ]);
    expect(resolved).toMatchObject({ error: expect.stringContaining('enough clearance') });
  });

  test('requires a walkable zone and rejects endpoints outside the authored union', () => {
    const document = documentWith([]);
    expect(
      resolveEndpoint(document, { floorId: 'f1', kind: 'point', point: [0, 0] }, []),
    ).toMatchObject({ error: expect.stringContaining('Draw a walkable zone') });
    expect(
      resolveEndpoint(document, { floorId: 'f1', kind: 'point', point: [8, 8] }, [
        walkableZone('f1', [
          [-2, -2],
          [2, -2],
          [2, 2],
          [-2, 2],
        ]),
      ]),
    ).toMatchObject({ error: expect.stringContaining('outside a walkable zone') });
  });

  test('measures clearance from the walkable union boundary, not shared zone seams', () => {
    const document = documentWith([]);
    const zones = [
      walkableZone('f1', [
        [-5, -5],
        [0, -5],
        [0, 5],
        [-5, 5],
      ]),
      walkableZone('f1', [
        [0, -5],
        [5, -5],
        [5, 5],
        [0, 5],
      ]),
    ];
    expect(
      resolveEndpoint(document, { floorId: 'f1', kind: 'point', point: [0, 0] }, zones),
    ).toMatchObject({
      snapped: false,
      point: [0, 0],
    });
  });

  test('requires valid clear landings on both floors of a connector', () => {
    const document = documentWith([]);
    const upper = structuredClone(document.floors[0]!);
    upper.source = { ...upper.source, id: 'f2', heightOffset: 4, name: 'Upper' };
    document.floors.push(upper);
    document.baseline.portals = [
      {
        id: 'stairs-1',
        type: 'stairs',
        connects: ['f1', 'f2'],
        entries: [
          { floorId: 'f1', position: [0, 0], yawRadians: 0 },
          { floorId: 'f2', position: [0, 0], yawRadians: 0 },
        ],
      },
    ];
    const blocked = upper.zones;
    blocked.push({
      id: 'blocked-landing',
      label: 'Blocked landing',
      type: 'blocked',
      polygon: [
        [-2, -2],
        [2, -2],
        [2, 2],
        [-2, 2],
      ],
    });
    expect(invalidConnectorLandings(document, [walkableZone('f1'), walkableZone('f2')])).toEqual([
      'stairs-1',
    ]);
  });

  test('planning fails before querying navigation when either floor has no walkable zone', async () => {
    const document = documentWith([]);
    const navigator = {
      plan: () => {
        throw new Error('must not query');
      },
    } as never;
    const outcome = await planWayfindingRoute(
      navigator,
      document,
      [],
      {
        start: { floorId: 'f1', kind: 'point', point: [-1, 0] },
        dest: { floorId: 'f1', kind: 'point', point: [1, 0] },
        accessibleOnly: false,
        allowRestricted: false,
      },
      new AbortController().signal,
    );
    expect(outcome.failure).toContain('walkable zone');
  });
});

describe('describeRoute', () => {
  test('narrates turns with landmarks and arrival', () => {
    const booth = { ...createObject('booth', [5, 0]), position: [5, 0] as [number, number] };
    const document = documentWith([booth]);
    const route: PlanRoute = {
      segments: [
        {
          floorId: 'f1',
          points: [
            [0, 0],
            [5, 0],
            [5, 5],
          ],
        },
      ],
      distance: 10,
    };
    const described = describeRoute(route, document, 'Booth');
    expect(described.instructions.length).toBeGreaterThan(0);
    expect(described.instructions.at(-1)).toMatch(/Arrive/);
    expect(described.lengthM).toBeCloseTo(10, 5);
    expect(described.secondsEta).toBeCloseTo(10 / 1.2, 5);
  });

  test('straight routes get a walk statement', () => {
    const document = documentWith([]);
    const route: PlanRoute = {
      segments: [
        {
          floorId: 'f1',
          points: [
            [0, 0],
            [12, 0],
          ],
        },
      ],
      distance: 12,
    };
    const described = describeRoute(route, document, 'Exit');
    expect(described.instructions[0]).toMatch(/Walk 12 m/);
  });
});
