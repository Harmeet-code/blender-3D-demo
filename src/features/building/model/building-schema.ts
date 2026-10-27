import { z } from 'zod';
import { tilePyramidSchema } from './floor-tiles.ts';
import { assetReferenceSchema, finiteNumberSchema, point2Schema } from '@/types/spatial.ts';
import { isSimplePolygon, pointInPolygon, boundaryDistance } from '@/utils/geometry/polygon.ts';
import { sourceToMetres } from './floor-coordinates.ts';

/** Archives remain references only, including URLs received through saved JSON. */
export function isRuntimeAssetUrl(value: string): boolean {
  try {
    let path = new URL(value, 'https://layout.invalid/').pathname;
    for (let i = 0; i < 2; i++) {
      path = decodeURIComponent(path);
    }
    return !path
      .replaceAll('\\', '/')
      .split('/')
      .some((part) => part.toLowerCase() === 'archive');
  } catch {
    // Preserve existing relative/custom asset URL support; reject recognizable archive references.
    return !value
      .replaceAll('\\', '/')
      .split('/')
      .some((part) => part.toLowerCase() === 'archive');
  }
}
const runtimeAssetUrlSchema = z
  .string()
  .refine(isRuntimeAssetUrl, 'Archive references cannot be runtime assets');

/** [image X, image Y] in a calibrated pixel floor, otherwise [world X, world Z] meters. */
export const polygonPointSchema = point2Schema;
export type PolygonPoint = z.infer<typeof polygonPointSchema>;

const areaSchema = z
  .array(point2Schema)
  .min(3)
  .refine(isSimplePolygon, 'Area must be a simple polygon');
/** Endpoints use floor source coordinates; all construction dimensions remain meters. */
export const authoredWallSchema = z.object({
  id: z.string().min(1),
  start: point2Schema,
  end: point2Schema,
  thickness: finiteNumberSchema.positive(),
  height: finiteNumberSchema.positive(),
  openings: z
    .array(
      z.object({
        id: z.string().min(1),
        // Distance from wall.start to the opening CENTER, in meters.
        offset: finiteNumberSchema.nonnegative(),
        width: finiteNumberSchema.positive(),
        height: finiteNumberSchema.positive(),
        sill: finiteNumberSchema.nonnegative().optional(),
      }),
    )
    .optional(),
});
export type AuthoredWall = z.infer<typeof authoredWallSchema>;
export const authoredZoneSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['walkable', 'blocked', 'display']),
  /** Editor protection state. Missing values stay false without rewriting legacy zones. */
  locked: z.boolean().optional(),
  polygon: areaSchema,
});
export type AuthoredZone = z.infer<typeof authoredZoneSchema>;
export const authoredPoiSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  position: point2Schema,
  type: z.enum(['entry', 'exit', 'amenity', 'information', 'custom']),
  amenity: z
    .enum(['exit', 'washroom', 'elevator', 'food', 'coffee', 'information', 'atm'])
    .optional(),
});
export type AuthoredPoi = z.infer<typeof authoredPoiSchema>;
export const floorAuthoringSchema = z.object({
  boundary: areaSchema,
  obstacles: z.array(areaSchema),
  spawn: point2Schema,
  imageSize: z.tuple([finiteNumberSchema.positive(), finiteNumberSchema.positive()]).optional(),
  originalImage: runtimeAssetUrlSchema.optional(),
  tiles: tilePyramidSchema.extend({ template: runtimeAssetUrlSchema }).optional(),
  underlayOpacity: finiteNumberSchema.min(0).max(1).default(0.85),
  shellUrl: runtimeAssetUrlSchema.optional(),
  walls: z.array(authoredWallSchema).optional(),
  zones: z.array(authoredZoneSchema).optional(),
  pois: z.array(authoredPoiSchema).optional(),
  instances: z.array(
    z
      .object({
        id: z.string().min(1),
        assetId: z.string().optional(),
        url: runtimeAssetUrlSchema.optional(),
        position: point2Schema,
        yawRadians: finiteNumberSchema,
        scale: z.tuple([
          finiteNumberSchema.positive(),
          finiteNumberSchema.positive(),
          finiteNumberSchema.positive(),
        ]),
        dimensions: z.tuple([
          finiteNumberSchema.positive(),
          finiteNumberSchema.positive(),
          finiteNumberSchema.positive(),
        ]),
        collidable: z.boolean(),
      })
      .refine((item) => !!item.assetId || !!item.url, 'Choose an asset or GLB'),
  ),
});
export type FloorAuthoring = z.infer<typeof floorAuthoringSchema>;

export const floorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  heightOffset: finiteNumberSchema,
  image: runtimeAssetUrlSchema,
  calibrationStatus: z.enum(['required', 'confirmed']).optional(),
  authoring: floorAuthoringSchema.optional(),
  coordinateSystem: z
    .discriminatedUnion('units', [
      z.object({ units: z.literal('meters') }),
      z.object({
        units: z.literal('pixels'),
        metersPerPixel: finiteNumberSchema.positive(),
        origin: point2Schema,
        basis: z
          .tuple([finiteNumberSchema, finiteNumberSchema, finiteNumberSchema, finiteNumberSchema])
          .refine(
            ([a, b, c, d]) => Math.abs(a * d - b * c) > 1e-12,
            'Calibration matrix must be invertible',
          )
          .optional(),
      }),
    ])
    .optional(),
  logisticsAnchors: z
    .array(
      z.object({
        id: z.string().min(1),
        position: point2Schema,
        yawRadians: finiteNumberSchema,
        assetId: z.enum(['forklift', 'pallet']),
      }),
    )
    .optional(),
});
export type Floor = z.infer<typeof floorSchema>;

export const roomTypeSchema = z.enum(['booth', 'hall', 'walkable', 'service']);
export type RoomType = z.infer<typeof roomTypeSchema>;

export const roomSchema = z.object({
  id: z.string().min(1),
  floorId: z.string().min(1),
  polygon: z
    .array(polygonPointSchema)
    .min(3)
    .refine(isSimplePolygon, 'Room polygon must be simple and have nonzero area'),
  type: z.enum(['booth', 'hall', 'walkable', 'service']).default('booth'),
  label: z.string().optional(),
  price: z.number().nonnegative().optional(),
  entrance: z.object({ position: point2Schema, yawRadians: finiteNumberSchema }).optional(),
  boothAssetRef: assetReferenceSchema.optional(),
  boothModelUrl: runtimeAssetUrlSchema.optional(),
  dimensionsFeet: z
    .tuple([finiteNumberSchema.positive(), finiteNumberSchema.positive()])
    .optional(),
});
export type Room = z.infer<typeof roomSchema>;

export const portalTypeSchema = z.enum(['elevator', 'escalator', 'stairs']);
export type PortalType = z.infer<typeof portalTypeSchema>;

export const portalSchema = z.object({
  id: z.string().min(1),
  type: portalTypeSchema,
  position: point2Schema.optional(),
  connects: z.array(z.string().min(1)).min(2),
  entries: z
    .array(
      z.object({
        floorId: z.string().min(1),
        position: point2Schema,
        yawRadians: finiteNumberSchema,
      }),
    )
    .optional(),
});
export type Portal = z.infer<typeof portalSchema>;

export const buildingLayoutSchema = z
  .object({
    schemaVersion: z.literal(2).optional(),
    buildingId: z.string().min(1),
    floors: z.array(floorSchema).min(1),
    rooms: z.array(roomSchema).default([]),
    portals: z.array(portalSchema).default([]),
  })
  .superRefine((layout, ctx) => {
    const floors = new Set(layout.floors.map((f) => f.id));
    const checkIds = (items: Array<{ id: string }>, path: string) => {
      const seen = new Set<string>();
      for (const [i, item] of items.entries()) {
        if (seen.has(item.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path, i, 'id'],
            message: 'Duplicate ID',
          });
        }
        seen.add(item.id);
      }
    };
    checkIds(layout.floors, 'floors');
    checkIds(layout.rooms, 'rooms');
    checkIds(layout.portals, 'portals');
    for (const [i, room] of layout.rooms.entries()) {
      const calibration = layout.floors.find(
        (floor) => floor.id === room.floorId,
      )?.coordinateSystem;
      const unitScale = calibration?.units === 'pixels' ? calibration.metersPerPixel : 1;
      if (room.dimensionsFeet) {
        const points = room.polygon.map((p) => sourceToMetres(p, calibration));
        const expected = room.dimensionsFeet.map((n) => n * 0.3048);
        const valid =
          points.length === 4 &&
          points.every((p, j) => {
            const next = points[(j + 1) % 4]!;
            const after = points[(j + 2) % 4]!;
            const dx = next[0] - p[0],
              dz = next[1] - p[1];
            const ex = after[0] - next[0],
              ez = after[1] - next[1];
            const length = Math.hypot(dx, dz);
            return (
              Math.abs(length - expected[j % 2]!) < 0.005 &&
              Math.abs(dx * ex + dz * ez) / (length * Math.hypot(ex, ez)) < 0.001
            );
          });
        if (!valid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['rooms', i, 'dimensionsFeet'],
            message: 'Booth polygon must match its actual width and depth in feet',
          });
        }
      }
      if (!floors.has(room.floorId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rooms', i, 'floorId'],
          message: 'Unknown floor',
        });
      }
      if (
        room.entrance &&
        (!pointInPolygon(room.entrance.position, room.polygon) ||
          boundaryDistance(room.entrance.position, room.polygon) * unitScale > 0.005)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rooms', i, 'entrance'],
          message: 'Entrance must lie on the room boundary',
        });
      }
    }
    for (const [i, portal] of layout.portals.entries()) {
      if (
        new Set(portal.connects).size !== portal.connects.length ||
        portal.connects.some((id) => !floors.has(id))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['portals', i, 'connects'],
          message: 'Connections must reference distinct known floors',
        });
      }
      const entryFloors = new Set<string>();
      for (const entry of portal.entries ?? []) {
        if (!portal.connects.includes(entry.floorId) || entryFloors.has(entry.floorId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['portals', i, 'entries'],
            message: 'Entries must reference distinct connected floors',
          });
        }
        entryFloors.add(entry.floorId);
      }
    }
    for (const [i, floor] of layout.floors.entries()) {
      if (!floor.image && (!floor.authoring || floor.coordinateSystem?.units === 'pixels')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['floors', i, 'image'],
          message: 'An image-free floor requires metric authoring geometry',
        });
      }
      const { authoring } = floor;
      for (const category of ['walls', 'zones', 'pois'] as const) {
        const seen = new Set<string>();
        for (const [j, item] of (authoring?.[category] ?? []).entries()) {
          if (seen.has(item.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['floors', i, 'authoring', category, j, 'id'],
              message: 'Duplicate ID',
            });
          }
          seen.add(item.id);
        }
      }
      for (const [j, wall] of (authoring?.walls ?? []).entries()) {
        const start = sourceToMetres(wall.start, floor.coordinateSystem);
        const end = sourceToMetres(wall.end, floor.coordinateSystem);
        const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
        const path = ['floors', i, 'authoring', 'walls', j];
        if (length < 0.001) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path,
            message: 'Wall endpoints must be distinct',
          });
        }
        const openings = [...(wall.openings ?? [])].sort((a, b) => a.offset - b.offset);
        const ids = new Set<string>();
        let previousEnd = 0;
        for (const opening of openings) {
          if (
            ids.has(opening.id) ||
            opening.offset - opening.width / 2 < previousEnd - 1e-6 ||
            opening.offset + opening.width / 2 > length + 1e-6 ||
            (opening.sill ?? 0) + opening.height > wall.height + 1e-6
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...path, 'openings'],
              message:
                'Openings require unique IDs, must fit within the metric wall, and cannot overlap',
            });
          }
          ids.add(opening.id);
          previousEnd = opening.offset + opening.width / 2;
        }
      }
      const instances = floor.authoring?.instances ?? [];
      if (new Set(instances.map((item) => item.id)).size !== instances.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['floors', i, 'authoring'],
          message: 'Duplicate placement ID',
        });
      }
      const ids = new Set<string>();
      for (const anchor of floor.logisticsAnchors ?? []) {
        if (ids.has(anchor.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['floors', i, 'logisticsAnchors'],
            message: 'Duplicate logistics anchor ID',
          });
        }
        ids.add(anchor.id);
      }
    }
  });
export type BuildingLayout = z.infer<typeof buildingLayoutSchema>;

export const boothStatusSchema = z.enum(['available', 'reserved', 'occupied']);
export type BoothStatus = z.infer<typeof boothStatusSchema>;

export const avatarStateSchema = z.object({
  id: z.string().min(1),
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotationY: z.number(),
  floorId: z.string().min(1),
  animationState: z.enum(['idle', 'walk', 'run']).default('idle'),
});
export type AvatarState = z.infer<typeof avatarStateSchema>;

export const boothAddOnSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['prop', 'logistics', 'branding']),
});
export type BoothAddOn = z.infer<typeof boothAddOnSchema>;

/** Catalogue of e-commerce add-ons shown in the booth customizer drawer. */
export const BOOTH_ADD_ONS = [
  { id: 'logo-banner', label: 'Logo on event floor banner', kind: 'branding' },
  { id: 'chair', label: 'Chair', kind: 'prop' },
  { id: 'table', label: 'Table', kind: 'prop' },
  { id: 'display-case', label: 'Display case', kind: 'prop' },
  { id: 'forklift-service', label: 'Forklift service', kind: 'prop' },
  { id: 'pallet-service', label: 'Pallet service', kind: 'prop' },
  { id: 'safe-service', label: 'Safe service', kind: 'logistics' },
  { id: 'early-setup', label: 'Early booth set-up', kind: 'logistics' },
  { id: 'early-delivery', label: 'Early delivery', kind: 'logistics' },
  { id: 'exhibitor-parking', label: 'Exhibitor parking', kind: 'logistics' },
  { id: 'visa-letter', label: 'Visa letter', kind: 'logistics' },
] as const satisfies readonly BoothAddOn[];
export type BoothAddOnId = (typeof BOOTH_ADD_ONS)[number]['id'];

export const demoLayout: BuildingLayout = {
  buildingId: 'convention-center-01',
  floors: [
    { id: 'B1', name: 'Underground', heightOffset: -4.0, image: '/b1.jpg' },
    { id: 'F1', name: 'Ground Floor', heightOffset: 0.0, image: '/f1.jpg' },
  ],
  rooms: [
    {
      id: 'room-101',
      floorId: 'F1',
      polygon: [
        [0, 0],
        [10, 0],
        [10, 8],
        [0, 8],
      ],
      type: 'booth',
    },
  ],
  portals: [{ id: 'lift-01', type: 'elevator', connects: ['B1', 'F1'] }],
};
