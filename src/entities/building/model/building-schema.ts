import { z } from 'zod';

/** 2D polygon point: [x, y] in floor-plan pixels/metres. */
export const polygonPointSchema = z.tuple([z.number(), z.number()]);
export type PolygonPoint = z.infer<typeof polygonPointSchema>;

export const floorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  heightOffset: z.number(),
  image: z.string().min(1),
});
export type Floor = z.infer<typeof floorSchema>;

export const roomTypeSchema = z.enum(['booth', 'hall', 'walkable', 'service']);
export type RoomType = z.infer<typeof roomTypeSchema>;

export const roomSchema = z.object({
  id: z.string().min(1),
  floorId: z.string().min(1),
  polygon: z.array(polygonPointSchema).min(3),
  type: z.enum(['booth', 'hall', 'walkable', 'service']).default('booth'),
  label: z.string().optional(),
  price: z.number().nonnegative().optional(),
});
export type Room = z.infer<typeof roomSchema>;

export const portalTypeSchema = z.enum(['elevator', 'escalator', 'stairs']);
export type PortalType = z.infer<typeof portalTypeSchema>;

export const portalSchema = z.object({
  id: z.string().min(1),
  type: portalTypeSchema,
  position: z.tuple([z.number(), z.number()]).optional(),
  connects: z.array(z.string().min(1)).min(2),
});
export type Portal = z.infer<typeof portalSchema>;

export const buildingLayoutSchema = z.object({
  buildingId: z.string().min(1),
  floors: z.array(floorSchema).min(1),
  rooms: z.array(roomSchema).default([]),
  portals: z.array(portalSchema).default([]),
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
export const BOOTH_ADD_ONS: BoothAddOn[] = [
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
];

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
