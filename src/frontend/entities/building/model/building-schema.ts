import { z } from 'zod';
import {
  assetReferenceSchema,
  finiteNumberSchema,
  point2Schema,
} from '../../../shared/model/spatial.ts';
import {
  isSimplePolygon,
  pointInPolygon,
  boundaryDistance,
} from '../../../shared/lib/geometry/polygon.ts';

/** [image X, image Y] in a calibrated pixel floor, otherwise [world X, world Z] meters. */
export const polygonPointSchema = point2Schema;
export type PolygonPoint = z.infer<typeof polygonPointSchema>;

export const floorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  heightOffset: finiteNumberSchema,
  image: z.string().min(1),
  coordinateSystem: z
    .discriminatedUnion('units', [
      z.object({ units: z.literal('meters') }),
      z.object({
        units: z.literal('pixels'),
        metersPerPixel: finiteNumberSchema.positive(),
        origin: point2Schema,
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
