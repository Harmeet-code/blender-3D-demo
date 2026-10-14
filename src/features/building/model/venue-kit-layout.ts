import baseCatalogJson from '../../../assets/metadata/catalog.v1.json';
import boothSizesJson from '../../../assets/metadata/booth-sizes.v1.json';
import { expansionAssetMetadata } from '../../assets/model/expansion-metadata.ts';
import { VENUE_KITS } from '../../assets/model/venue-kit-presets.ts';
import type { AssetId } from '../../assets/model/asset-schema.ts';
import type { BuildingLayout, FloorAuthoring, Room } from './building-schema.ts';

type Vec3 = [number, number, number];
type Vec2 = [number, number];
type BoothSize = { id: string; label: string; dimensionsFeet: [number, number]; url: string };
const boothSizes = boothSizesJson as unknown as BoothSize[];
export const MAX_KIT_ITEM_COUNT = 100;

const baseDimensions = new Map<string, Vec3>(
  (baseCatalogJson as unknown as { id: string; dimensions: Vec3 }[]).map((item) => [
    item.id,
    item.dimensions,
  ]),
);
for (const size of boothSizesJson as unknown as { id: string; dimensionsMetres: Vec3 }[]) {
  baseDimensions.set(size.id, size.dimensionsMetres);
}
for (const item of expansionAssetMetadata) {
  baseDimensions.set(item.id, [...item.dimensions] as Vec3);
}

function dims(assetId: string): Vec3 {
  const found = baseDimensions.get(assetId);
  if (!found) {
    throw new Error(`Starter composer has no dimensions for ${assetId}`);
  }
  return [...found] as Vec3;
}

interface Composer {
  kit: string;
  items: readonly { assetId: string; count: number }[];
  counts: Map<string, number>;
  instances: FloorAuthoring['instances'];
  nextId(assetId: string): string;
  take(assetId: string): boolean;
  place(
    floor: 'f1' | 'f2',
    buckets: Record<'f1' | 'f2', FloorAuthoring['instances']>,
    assetId: string,
    x: number,
    z: number,
    yaw?: number,
    collidable?: boolean,
  ): void;
}

function composerFor(kitId: string, overrides?: Partial<Record<AssetId, number>>): Composer {
  const kit = VENUE_KITS.find((item) => item.id === kitId);
  if (!kit) {
    throw new Error(`Unknown venue kit: ${kitId}`);
  }
  const defaults = new Map<string, number>();
  for (const item of kit.items) {
    defaults.set(item.assetId, (defaults.get(item.assetId) ?? 0) + item.count);
  }
  for (const [assetId, count] of Object.entries(overrides ?? {})) {
    if (!defaults.has(assetId)) {
      throw new Error(`${assetId} is not part of the ${kitId} starter kit`);
    }
    if (count === undefined) {
      continue;
    }
    if (!Number.isSafeInteger(count) || count! < 0 || count! > MAX_KIT_ITEM_COUNT) {
      throw new Error(`${assetId} quantity must be a whole number from 0 to ${MAX_KIT_ITEM_COUNT}`);
    }
  }
  const selected = new Map<string, number>();
  for (const [assetId, defaultCount] of defaults) {
    selected.set(assetId, overrides?.[assetId as AssetId] ?? defaultCount);
  }
  const counts = new Map(selected);
  const items = [...selected].map(([assetId, count]) => ({ assetId, count }));
  const instances: FloorAuthoring['instances'] = [];
  const indices = new Map<string, number>();
  const composer: Composer = {
    kit: kitId,
    items,
    counts,
    instances,
    nextId(assetId) {
      const index = indices.get(assetId) ?? 0;
      indices.set(assetId, index + 1);
      return `inst-${kitId}-${assetId}-${index}`;
    },
    take(assetId) {
      const remaining = counts.get(assetId) ?? 0;
      if (remaining <= 0) {
        return false;
      }
      counts.set(assetId, remaining - 1);
      return true;
    },
    place(floor, buckets, assetId, x, z, yaw = 0, collidable = true) {
      if (!composer.take(assetId)) {
        return;
      }
      buckets[floor].push({
        id: composer.nextId(assetId),
        assetId,
        position: [x, z],
        yawRadians: yaw,
        scale: [1, 1, 1],
        dimensions: dims(assetId),
        collidable,
      });
    },
  };
  return composer;
}

const BOUNDARY: Vec2[] = [
  [-32, -22],
  [32, -22],
  [32, 22],
  [-32, 22],
];

function boundsAt(
  center: Vec2,
  dimensions: Vec3,
  yawRadians = 0,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const halfX =
    (Math.abs(Math.cos(yawRadians)) * dimensions[0] +
      Math.abs(Math.sin(yawRadians)) * dimensions[2]) /
    2;
  const halfZ =
    (Math.abs(Math.sin(yawRadians)) * dimensions[0] +
      Math.abs(Math.cos(yawRadians)) * dimensions[2]) /
    2;
  return {
    minX: center[0] - halfX,
    maxX: center[0] + halfX,
    minZ: center[1] - halfZ,
    maxZ: center[1] + halfZ,
  };
}

function overlaps(a: ReturnType<typeof boundsAt>, b: ReturnType<typeof boundsAt>, clearance = 0.4) {
  return (
    a.minX < b.maxX + clearance &&
    a.maxX + clearance > b.minX &&
    a.minZ < b.maxZ + clearance &&
    a.maxZ + clearance > b.minZ
  );
}

function boothRooms(
  kitId: string,
  composer: Composer,
  buckets: Record<'f1' | 'f2', FloorAuthoring['instances']>,
): Room[] {
  const kitItems = composer.items.filter((item) => item.assetId.startsWith('booth-'));
  if (!kitItems.length) {
    return [];
  }
  const floorId = `starter-${kitId}-f2`;
  const placed: Array<ReturnType<typeof boundsAt>> = [];
  const rooms: Room[] = [];
  const targets: Vec2[] = [
    [4, 10],
    [-2, 10],
    [-6, 0],
  ];
  const candidates: Vec2[] = [];
  for (let z = -15; z <= 15; z += 6) {
    for (let x = -27; x <= 27; x += 6) {
      candidates.push([x, z]);
    }
  }
  for (const item of kitItems) {
    const model = boothSizes.find((booth) => booth.id === item.assetId);
    if (!model) {
      throw new Error(`Starter composer has no booth model for ${item.assetId}`);
    }
    const width = model.dimensionsFeet[0] * 0.3048;
    const depth = model.dimensionsFeet[1] * 0.3048;
    const dimensions: Vec3 = [width, 2.8, depth];
    for (let index = 0; index < item.count; index++) {
      if (!composer.take(item.assetId)) {
        throw new Error(`Starter composer could not allocate ${item.assetId} ${index + 1}`);
      }
      const center = candidates.find((candidate) => {
        const box = boundsAt(candidate, dimensions);
        const inside =
          box.minX >= BOUNDARY[0]![0] &&
          box.maxX <= BOUNDARY[1]![0] &&
          box.minZ >= BOUNDARY[0]![1] &&
          box.maxZ <= BOUNDARY[2]![1];
        const targetClear = targets.every(
          (target) => !overlaps(box, boundsAt(target, [0.8, 1, 0.8]), 0.6),
        );
        const roomClear = placed.every((existing) => !overlaps(box, existing, 0.5));
        const instanceClear = buckets.f2.every((instance) => {
          if (!instance.collidable || instance.dimensions[1] <= 0.03) {
            return true;
          }
          return !overlaps(
            box,
            boundsAt(instance.position, instance.dimensions, instance.yawRadians),
            0.4,
          );
        });
        return inside && targetClear && roomClear && instanceClear;
      });
      if (!center) {
        throw new Error(
          `${kitId} requests ${item.count} ${item.assetId} rooms; the starter floor boundary has no safe room slot.`,
        );
      }
      placed.push(boundsAt(center, dimensions));
      const [x, z] = center;
      const halfWidth = width / 2;
      const halfDepth = depth / 2;
      rooms.push({
        id: `room-${kitId}-${item.assetId}-${index}`,
        floorId,
        polygon: [
          [x - halfWidth, z - halfDepth],
          [x + halfWidth, z - halfDepth],
          [x + halfWidth, z + halfDepth],
          [x - halfWidth, z + halfDepth],
        ],
        type: 'booth',
        label: `${model.label} ${index + 1}`,
        entrance: { position: [x, z + halfDepth], yawRadians: 0 },
        boothAssetRef: { id: item.assetId, version: 1 },
        dimensionsFeet: [...model.dimensionsFeet] as [number, number],
      });
    }
  }
  return rooms;
}

function placeRemainder(
  composer: Composer,
  buckets: Record<'f1' | 'f2', FloorAuthoring['instances']>,
  layout: BuildingLayout,
) {
  const floors = layout.floors.filter((floor) => floor.authoring);
  const targets = new Map(
    floors.map((floor) => [
      floor.id,
      [
        floor.authoring!.spawn,
        ...(floor.authoring!.pois ?? []).map((poi) => poi.position),
        ...layout.portals.flatMap((portal) =>
          (portal.entries ?? [])
            .filter((entry) => entry.floorId === floor.id)
            .map((entry) => entry.position),
        ),
      ],
    ]),
  );
  const floorByKey = new Map(
    floors.map((floor, index) => [floor.id, index === 0 ? 'f1' : 'f2'] as const),
  );
  const candidatePoints: Vec2[] = [];
  for (let z = -19; z <= 19; z += 3) {
    for (let x = -29; x <= 29; x += 3) {
      candidatePoints.push([x, z]);
    }
  }
  for (const item of composer.items) {
    if (item.assetId.startsWith('booth-')) {
      continue;
    }
    while ((composer.counts.get(item.assetId) ?? 0) > 0) {
      const dimensions = dims(item.assetId);
      let found: { floor: 'f1' | 'f2'; point: Vec2 } | undefined;
      for (const floor of floors) {
        const floorKey = floorByKey.get(floor.id);
        if (!floorKey) {
          continue;
        }
        for (const point of candidatePoints) {
          const box = boundsAt(point, dimensions);
          if (
            box.minX < BOUNDARY[0]![0] ||
            box.maxX > BOUNDARY[1]![0] ||
            box.minZ < BOUNDARY[0]![1] ||
            box.maxZ > BOUNDARY[2]![1]
          ) {
            continue;
          }
          const targetClear = (targets.get(floor.id) ?? []).every(
            (target) => !overlaps(box, boundsAt(target, [0.8, 1, 0.8]), 0.6),
          );
          if (!targetClear) {
            continue;
          }
          const occupied =
            buckets[floorKey].some((placed) => {
              if (!placed.collidable || placed.dimensions[1] <= 0.03) {
                return false;
              }
              return overlaps(
                box,
                boundsAt(placed.position, placed.dimensions, placed.yawRadians),
                0.4,
              );
            }) ||
            (floorKey === 'f2' &&
              layout.rooms.some((room) => {
                const x =
                  room.polygon.reduce((sum, point) => sum + point[0], 0) / room.polygon.length;
                const z =
                  room.polygon.reduce((sum, point) => sum + point[1], 0) / room.polygon.length;
                const width =
                  Math.max(...room.polygon.map((point) => point[0])) -
                  Math.min(...room.polygon.map((point) => point[0]));
                const depth =
                  Math.max(...room.polygon.map((point) => point[1])) -
                  Math.min(...room.polygon.map((point) => point[1]));
                return (
                  room.floorId === floor.id &&
                  overlaps(box, boundsAt([x, z], [width, 2.8, depth]), 0.4)
                );
              }));
          if (!occupied) {
            found = { floor: floorKey, point };
            break;
          }
        }
        if (found) {
          break;
        }
      }
      if (!found) {
        throw new Error(
          `${item.assetId} has ${composer.counts.get(item.assetId)} unplaced items; reduce the kit count or expand the starter floor boundary.`,
        );
      }
      composer.place(found.floor, buckets, item.assetId, found.point[0], found.point[1]);
    }
  }
}

/**
 * Deterministic starter draft from a pick-list kit. Every selected quantity is
 * represented by an authored instance or a sized booth room; spare items use
 * bounded, collision-aware grid slots for later drag tuning. IDs are scoped by
 * asset so changing one kit quantity does not renumber unrelated placements.
 */
export function composeKitLayout(
  kitId: string,
  counts?: Partial<Record<AssetId, number>>,
): BuildingLayout {
  const composer = composerFor(kitId, counts);
  const f1: FloorAuthoring['instances'] = [];
  const f2: FloorAuthoring['instances'] = [];
  const buckets = { f1, f2 };
  const place = composer.place.bind(composer);

  // Building pad: 5 x 3 shell slabs (low, non-collidable ground).
  for (const x of [-12, -6, 0, 6, 12]) {
    for (const z of [-9, -3, 3]) {
      place('f1', buckets, 'shell-slab', x, z, 0, false);
    }
  }
  // Columns on pad corners and mid-edges.
  for (const [x, z] of [
    [-16, -12],
    [16, -12],
    [-16, 6],
    [16, 6],
    [-16, -3],
    [16, -3],
  ] as Vec2[]) {
    place('f1', buckets, 'shell-column', x, z);
  }
  // North facade: exact 4 m tiling, no gaps.
  for (const x of [-14, -10, -6, -2, 2, 6, 10, 14]) {
    place('f1', buckets, 'shell-facade-panel', x, -12);
  }
  // South facade with a central entrance forecourt (x -4..4 open).
  for (const x of [-14, -10, -6, 6, 10, 14]) {
    place('f1', buckets, 'shell-facade-panel', x, 6);
  }
  place('f1', buckets, 'door-double', 0, 6);
  place('f1', buckets, 'shell-canopy', 0, 7.2);

  // Lobby services.
  place('f1', buckets, 'info-desk', -6, 2);
  place('f1', buckets, 'food-kiosk', 6, 0);
  if (kitId === 'mall') {
    place('f1', buckets, 'food-kiosk', -2, -8);
  }
  // Queue rails (yawed north-south) guiding toward the elevator corner.
  place('f1', buckets, 'queue-rail', -11, -2, Math.PI / 2);
  place('f1', buckets, 'queue-rail', -13, -2, Math.PI / 2);
  // Totem signs beside their POIs.
  place('f1', buckets, 'exit-sign', 2.5, 4.2);
  place('f1', buckets, 'washroom-sign', 10, 2);
  place('f1', buckets, 'atm-sign', 12, -2);
  // Lobby dressing along the west wall.
  let dressZ = -6;
  for (const assetId of [
    'planter',
    'bench',
    'trash-bin',
    'planter',
    'trash-bin',
    'bench',
  ] as const) {
    if (dressZ > 5) {
      break;
    }
    place('f1', buckets, assetId, -14, dressZ, assetId === 'bench' ? Math.PI / 2 : 0);
    dressZ += 3;
  }
  place('f1', buckets, 'trash-bin', 8, 4.2);
  place('f1', buckets, 'podium', -9, 4.2);

  // Parking: row A south, overflow row B west of the walkway.
  const bays = Math.min(composer.counts.get('parking-bay') ?? 0, 12);
  for (let i = 0; i < bays; i++) {
    place('f1', buckets, 'parking-bay', -20 + i * 2.6, 15, 0, false);
  }
  const accessible = Math.min(composer.counts.get('parking-accessible') ?? 0, 4);
  for (let i = 0; i < accessible; i++) {
    place('f1', buckets, 'parking-accessible', 8.5 + i * 3.7, 15, 0, false);
  }
  const overflow = Math.min((composer.counts.get('parking-bay') ?? 0) - bays, 8);
  for (let i = 0; i < overflow; i++) {
    place('f1', buckets, 'parking-bay', -28 + i * 2.6, 9.5, 0, false);
  }
  // North-south road east of parking, zebra link to the forecourt.
  place('f1', buckets, 'road-segment', 26, 10);
  if (kitId === 'mall' || kitId === 'sports' || kitId === 'airport' || kitId === 'hospital') {
    place('f1', buckets, 'road-segment', 26, -2);
  }
  place('f1', buckets, 'crosswalk', 0, 11.5, 0, false);
  const chargers = composer.counts.get('ev-charger') ?? 0;
  for (let i = 0; i < chargers; i++) {
    place('f1', buckets, 'ev-charger', 20.5 + i * 1.5, 17.5);
  }

  // Level 1: open hall pad, columns, circulation only.
  for (const x of [-6, 0, 6]) {
    for (const z of [-3, 3]) {
      place('f2', buckets, 'shell-slab', x, z, 0, false);
    }
  }
  for (const [x, z] of [
    [-9, -6],
    [9, -6],
    [-9, 6],
    [9, 6],
  ] as Vec2[]) {
    place('f2', buckets, 'shell-column', x, z);
  }

  const floor = (
    id: string,
    name: string,
    heightOffset: number,
    spawn: Vec2,
    pois: FloorAuthoring['pois'],
    instances: FloorAuthoring['instances'],
  ): BuildingLayout['floors'][number] => ({
    id,
    name,
    heightOffset,
    image: '',
    coordinateSystem: { units: 'meters' },
    calibrationStatus: 'confirmed',
    authoring: {
      boundary: [...BOUNDARY] as Vec2[],
      obstacles: [],
      spawn,
      instances,
      underlayOpacity: 0,
      walls: [],
      zones: [],
      pois,
    },
  });

  const poi = (
    id: string,
    label: string,
    position: Vec2,
    type: 'exit' | 'amenity' | 'information',
    amenity?: 'exit' | 'washroom' | 'elevator' | 'food' | 'coffee' | 'information' | 'atm',
  ) => ({ id, label, position, type, ...(amenity ? { amenity } : {}) });

  const layout: BuildingLayout = {
    schemaVersion: 2,
    buildingId: `starter-${kitId}`,
    floors: [
      floor(
        `starter-${kitId}-f1`,
        'Ground',
        0,
        [0, 11],
        [
          poi(`poi-${kitId}-exit`, 'Main exit', [0, 9.3], 'exit'),
          poi(`poi-${kitId}-info`, 'Information', [-6, 3.4], 'information'),
          poi(`poi-${kitId}-food`, 'Food', [6, 2.5], 'amenity', 'food'),
          poi(`poi-${kitId}-washroom`, 'Washrooms', [10, 3.2], 'amenity', 'washroom'),
          poi(`poi-${kitId}-atm`, 'ATM', [12, -0.8], 'amenity', 'atm'),
        ],
        f1,
      ),
      floor(
        `starter-${kitId}-f2`,
        'Level 1',
        4,
        [4, 10],
        [poi(`poi-${kitId}-exit-f2`, 'Level 1 exit', [-2, 10], 'exit')],
        f2,
      ),
    ],
    rooms: [],
    portals: [
      {
        id: `elevator-${kitId}`,
        type: 'elevator',
        connects: [`starter-${kitId}-f1`, `starter-${kitId}-f2`],
        entries: [
          { floorId: `starter-${kitId}-f1`, position: [-12, -6], yawRadians: 0 },
          { floorId: `starter-${kitId}-f2`, position: [-6, 0], yawRadians: 0 },
        ],
      },
    ],
  };

  layout.rooms.push(...boothRooms(kitId, composer, buckets));
  placeRemainder(composer, buckets, layout);
  return layout;
}

export interface VenueKitCountSummary {
  assetId: string;
  selected: number;
  instances: number;
  rooms: number;
}

/** Report requested quantities by their generated representation. */
export function venueKitCountSummary(
  kitId: string,
  layout?: BuildingLayout,
  overrides?: Partial<Record<AssetId, number>>,
): VenueKitCountSummary[] {
  const kit = VENUE_KITS.find((item) => item.id === kitId);
  if (!kit) {
    throw new Error(`Unknown venue kit: ${kitId}`);
  }
  const actualLayout = layout ?? composeKitLayout(kitId, overrides);
  const selected = new Map<string, number>();
  for (const item of kit.items) {
    selected.set(item.assetId, (selected.get(item.assetId) ?? 0) + item.count);
  }
  for (const [assetId, count] of Object.entries(overrides ?? {})) {
    if (count !== undefined && selected.has(assetId)) {
      selected.set(assetId, count);
    }
  }
  return [...selected].map(([assetId, count]) => ({
    assetId,
    selected: count,
    instances: actualLayout.floors.reduce(
      (total, floor) =>
        total +
        (floor.authoring?.instances.filter((instance) => instance.assetId === assetId).length ?? 0),
      0,
    ),
    rooms: actualLayout.rooms.filter((room) => room.boothAssetRef?.id === assetId).length,
  }));
}
