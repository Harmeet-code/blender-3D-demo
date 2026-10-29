import { z } from 'zod';
import { boothDesignSchema } from './booth-schema.ts';
import { circulationDesignSchema } from './circulation-schema.ts';
import { parkingDesignSchema } from './parking-schema.ts';
import { finiteNumberSchema, point2Schema } from '@/types/spatial.ts';
import type { BuildingLayout, Floor, Room } from '@/features/building/model/building-schema.ts';
import {
  isSimplePolygon,
  signedArea,
  polygonEdges,
  segmentsIntersect,
} from '@/utils/geometry/polygon.ts';

export const recipes = [
  'booth',
  'polygon-booth',
  'stairs',
  'barn-tent',
  'entrance',
  'washroom-men',
  'washroom-women',
  'kids-zone',
  'avatar',
  'elevator',
  'escalator',
  'ramp',
  'information',
  'bench',
  'table',
  'chair',
  'barrier',
  'planter',
  'bin',
  'food-kiosk',
  'water',
  'first-aid',
  'exit',
  'show-office',
  'shipping',
  'wash-rack',
  'parking-lot',
  'food-truck',
  'dining',
  'legacy',
] as const;
export type RecipeId = (typeof recipes)[number];
export const documentTypes = ['booth', 'structure', 'area', 'asset'] as const;
export const planDocumentTypeSchema = z.enum(documentTypes);
export type PlanDocumentType = (typeof documentTypes)[number];
export const polygonSchema = z
  .array(point2Schema)
  .min(3)
  .max(256)
  .refine(
    (points) => points.length <= 256 && isSimplePolygon(points),
    'Use distinct vertices and a simple polygon without crossings.',
  )
  .refine(
    (points) => Math.abs(signedArea(points)) >= 0.01,
    'Polygon area must be at least 0.01 m².',
  )
  .superRefine((points, context) => {
    if (points.length > 256) {
      return;
    }
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        if (Math.hypot(points[i]![0] - points[j]![0], points[i]![1] - points[j]![1]) < 1e-8) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [j],
            message: `Vertex ${j + 1} repeats vertex ${i + 1}. Remove it; closure is implicit.`,
          });
        }
      }
    }
    const edges = polygonEdges(points);
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 2; j < edges.length; j++) {
        if (i === 0 && j === edges.length - 1) {
          continue;
        }
        if (segmentsIntersect(...edges[i]!, ...edges[j]!)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [i],
            message: `Edge ${i + 1} intersects edge ${j + 1}. Move or remove the involved vertices.`,
          });
        }
      }
    }
  });
const text = z.string().max(2048);
const positive = finiteNumberSchema.positive().max(1000);
export const objectSchema = z
  .object({
    id: z.string().min(1).max(256),
    recipe: z.enum(recipes),
    /** Semantic capability, independent of the procedural renderer used to draw the object. */
    documentType: planDocumentTypeSchema.optional(),
    name: text.trim().min(1, 'Name is required.'),
    managed: z.boolean().default(true),
    /** Locked objects stay out of marquee selection and every bulk edit. */
    locked: z.boolean().default(false),
    position: point2Schema,
    yawRadians: finiteNumberSchema,
    scale: z.tuple([positive, positive, positive]),
    /** Residual planar shear/reflection after floor-image recalibration. */
    planarMatrix: z
      .tuple([finiteNumberSchema, finiteNumberSchema, finiteNumberSchema, finiteNumberSchema])
      .refine(
        ([a, b, c, d]) => Math.abs(a * d - b * c) > 1e-8,
        'Calibration transform must be invertible.',
      )
      .optional(),
    dimensions: z.tuple([positive, positive, positive]),
    collidable: z.boolean(),
    polygon: polygonSchema,
    boothNumber: text.default(''),
    boothDesign: boothDesignSchema.optional(),
    circulationDesign: circulationDesignSchema.optional(),
    parkingDesign: parkingDesignSchema.optional(),
    boothSize: text.default(''),
    presetId: text.default(''),
    groupId: text.default(''),
    price: finiteNumberSchema.nonnegative().default(0),
    status: z.enum(['AVAILABLE', 'HOLD', 'BOOKED', 'UNAVAILABLE']).default('AVAILABLE'),
    company: text.default(''),
    boothType: text.default(''),
    youtubeLink: text.default(''),
    gate: z.enum(['front', 'back', 'left', 'right']).default('front'),
    tags: text.default(''),
    contactName: text.default(''),
    contactEmail: text.default(''),
    contactPhone: text.default(''),
    colorMode: z.enum(['surface', 'explicit']).default('surface'),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .default('#a5c9bb'),
    steps: z.number().int().min(1).max(100).default(8),
    handrails: z.boolean().default(true),
    tentStyle: z.enum(['barn', 'gazebo', 'marquee']).default('barn'),
    tentBays: z.number().int().min(1).max(8).default(2),
    roofOverhang: finiteNumberSchema.min(0).max(5).default(0),
    eavesRatio: finiteNumberSchema.min(0.3).max(0.95).default(0.72),
    tentEavesHeight: finiteNumberSchema.min(2).max(3).default(2.2),
    tentSidewall: z.enum(['open', 'half', 'full', 'windows']).default('open'),
    tentFlooring: z.enum(['none', 'grass', 'wood-deck']).default('none'),
    tentIndoors: z.boolean().default(false),
    polePositions: z.array(point2Schema).max(32).default([]),
    canopyMaterial: z.enum(['canvas', 'vinyl', 'transparent']).default('canvas'),
    poleMaterial: z.enum(['steel', 'wood', 'aluminium']).default('steel'),
    entranceGate: z
      .enum(['arch-sliding-doors', 'turnstile-lanes', 'open-arch'])
      .default('arch-sliding-doors'),
    entranceOpen: z.boolean().default(true),
    entranceOpening: finiteNumberSchema.min(1.2).max(6).optional(),
    washroomOpening: finiteNumberSchema.min(1.0).max(1.8).default(1.2),
    kidsDensity: finiteNumberSchema.min(0.2).max(1.0).default(0.6),
    avatarPose: z.enum(['idle', 'walking', 'pointing', 'sitting']).default('idle'),
    avatarSkin: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .default('#E0AC69'),
    avatarClothing: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .default('#2563EB'),
    avatarHair: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .default('#1E2022'),
    avatarAnimated: z.boolean().default(true),
    avatarPin: z.boolean().default(false),
    infoSignHeight: finiteNumberSchema.min(2.8).max(4.5).default(3.5),
    kioskQueueDepth: finiteNumberSchema.min(1.5).max(3.0).default(2.0),
    kioskMenu: text.default('ESPRESSO - $3.50 | LATTE - $4.50 | SANDWICH - $7.00'),
    exitOpen: z.boolean().default(false),
    showOfficeVariant: z.enum(['cabin', 'room', 'pop-up']).optional(),
    officeStatus: z.enum(['open', 'closed', 'back-in-10']).optional(),
    officeWindowOpen: z.boolean().optional(),
    officeDoorOpen: z.boolean().optional(),
    officeBlindsOpen: z.boolean().optional(),
    officeCutaway: finiteNumberSchema.min(0).max(1).optional(),
    officeInteriorDetail: z.boolean().optional(),
    officeHasFreightDesk: z.boolean().optional(),
    officeStaff: z.number().int().min(0).max(4).optional(),
    officeVisitors: z.number().int().min(0).max(8).optional(),
    officeBays: z.number().int().min(2).max(20).optional(),
    /** Wash rack fields stay optional so legacy flat-area records remain distinguishable. */
    washRackVariant: z.enum(['equestrian', 'livestock', 'vehicle-bay']).optional(),
    washRackWetness: finiteNumberSchema.min(0).max(1).optional(),
    washRackRunning: z.boolean().optional(),
    washRackBoomAngle: finiteNumberSchema.min(0).max(360).optional(),
    washRackBoomArc: z.union([z.literal(180), z.literal(360)]).optional(),
    /** Shipping customization is stored in the shared object draft; absent fields preserve legacy records. */
    shippingVariant: z.enum(['dock-bay', 'container-yard', 'staging-only']).optional(),
    shippingSeed: z.number().int().min(1).max(9999).optional(),
    shippingDensity: finiteNumberSchema.min(0).max(1).optional(),
    shippingDoorStates: z
      .array(z.enum(['open', 'closed']))
      .max(16)
      .optional(),
    shippingTrailerDocked: z.boolean().optional(),
    shippingLevelerAngle: finiteNumberSchema.min(-12).max(12).optional(),
    shippingForkliftActive: z.boolean().optional(),
    /** Dining settings are optional so existing saved areas keep their legacy appearance until edited. */
    diningStyle: z
      .enum(['grid4', 'grid6', 'rows-banquet', 'round6', 'round8', 'communal-long', 'cafe-bistro'])
      .optional(),
    diningChairStyle: z
      .enum(['plastic-stackable', 'wooden-cafe', 'bistro-wire', 'banquet-padded', 'bar-stool'])
      .optional(),
    diningSeed: z.number().int().min(1).max(999999).optional(),
    diningOccupancy: finiteNumberSchema.min(0).max(1).optional(),
    diningCenterpiece: z
      .enum(['none', 'vase-flowers', 'candle-lantern', 'table-number'])
      .optional(),
    diningTablecloth: z.boolean().optional(),
    diningShade: z.enum(['none', 'umbrella', 'pergola']).optional(),
    diningBoundary: z.enum(['none', 'planter', 'rope']).optional(),
    diningHost: z.boolean().optional(),
    diningBusTub: z.boolean().optional(),
    diningTableCount: z.number().int().min(1).max(200).optional(),
    diningVendorReferenceId: z.string().min(1).max(256).optional(),
    diningVendorServiceEdge: z.number().int().min(0).max(255).optional(),
    diningEntranceEdge: z.number().int().min(0).max(255).optional(),
    chairStyle: z
      .enum(['plastic-stackable', 'wooden-cafe', 'bistro-wire', 'banquet-padded', 'bar-stool'])
      .optional(),
    benchVariant: z.enum(['backed', 'backless']).default('backed'),
    tableVariant: z
      .enum(['cocktail-standing', 'standard-dining', 'cloth-draped'])
      .default('cocktail-standing'),
    tableTop: z.enum(['round', 'rectangular']).default('rectangular'),
    tableChairs: z.enum(['none', '2-chairs', '4-chairs']).default('none'),
    barrierBelt: z.enum(['cyan', 'blue', 'red']).default('cyan'),
    barrierSag: finiteNumberSchema.min(0.01).max(0.08).default(0.04),
    planterVariant: z.enum(['tall-tree', 'hedge-box', 'flower-shrub']).default('tall-tree'),
    planterSeed: z.number().int().min(1).max(9999).default(42),
    binStream: z.enum(['general-waste', 'recycling', 'organics']).default('general-waste'),
    binBody: z.enum(['dark', 'steel']).default('dark'),
    gender: z.enum(['men', 'women', 'unisex']).default('unisex'),
    roughness: finiteNumberSchema.min(0).max(1).default(0.65),
    metalness: finiteNumberSchema.min(0).max(1).default(0),
    portalId: text.default(''),
    connectsFloorIds: z.array(z.string().min(1)).max(20).default([]),
    targetLanding: point2Schema.default([5, 5]),
    legacyAssetId: text.optional(),
    legacyUrl: text.optional(),
    legacyRoom: z.boolean().optional(),
    legacyPoiId: text.optional(),
    legacyPortalLanding: z.boolean().optional(),
  })
  .superRefine((object, context) => {
    if (
      object.recipe === 'wash-rack' &&
      object.washRackVariant !== undefined &&
      object.washRackBoomAngle !== undefined &&
      object.washRackBoomAngle > (object.washRackBoomArc ?? 180)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['washRackBoomAngle'],
        message: 'Boom angle must stay within the configured sweep arc.',
      });
    }
  });
export type PlanObject = z.infer<typeof objectSchema>;
export interface PlanZone {
  id: string;
  label: string;
  type: 'walkable' | 'blocked' | 'display';
  /** Missing on older layouts; treated as unlocked until explicitly set. */
  locked?: boolean;
  polygon: [number, number][];
}
export interface PlanFloor {
  source: Floor;
  /** Immutable source basis of preserved legacy records; metric transform accumulates calibration edits. */
  referenceCoordinates?: Floor['coordinateSystem'];
  referenceTransform?: [number, number, number, number, number, number];
  calibrationText?: string;
  ownedPoiIds?: string[];
  referenceRooms?: Room[];
  boundary: [number, number][];
  spawn: [number, number];
  objects: PlanObject[];
  zones: PlanZone[];
}
export interface PlanDocument {
  baseline: BuildingLayout;
  floors: PlanFloor[];
  ownedPortalIds?: string[];
}
export type Tool =
  | 'select'
  | 'rectangle'
  | 'polygon'
  | 'place'
  | 'move'
  | 'duplicate'
  | 'resize'
  | 'edit-footprint'
  | 'remove'
  | 'zone-rectangle'
  | 'zone-polygon'
  | 'blocked-rectangle'
  | 'spawn'
  | 'route-start'
  | 'route-dest';
export interface Selection {
  kind: 'object' | 'zone';
  id: string;
}
export const isBooth = (
  object: Pick<PlanObject, 'recipe'> & Partial<Pick<PlanObject, 'documentType' | 'legacyRoom'>>,
) =>
  object.documentType !== undefined
    ? object.documentType === 'booth'
    : object.recipe === 'booth' || object.recipe === 'polygon-booth' || !!object.legacyRoom;
export const isShellStructure = (
  object: Pick<PlanObject, 'documentType'> & Partial<Pick<PlanObject, 'boothDesign'>>,
) => object.documentType === 'structure' && !!object.boothDesign;
export const isPlanArea = (object: Pick<PlanObject, 'documentType'>) =>
  object.documentType === 'area';
export const isConnector = (recipe: RecipeId) =>
  recipe === 'stairs' || recipe === 'elevator' || recipe === 'escalator' || recipe === 'ramp';
