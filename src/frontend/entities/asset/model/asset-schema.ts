import { z } from 'zod';
import {
  assetReferenceSchema,
  point2Schema,
  vector3Schema,
  finiteNumberSchema,
} from '../../../shared/model/spatial.ts';
import { isSimplePolygon } from '../../../shared/lib/geometry/polygon.ts';

export const ASSET_IDS = [
  'floor-tile',
  'wall-panel',
  'booth-frame',
  'chair',
  'table',
  'display-case',
  'safe',
  'pallet',
  'forklift',
  'banner-stand',
  'elevator-entrance',
  'stairs',
  'escalator-entrance',
] as const;
export type AssetId = (typeof ASSET_IDS)[number];
export { assetReferenceSchema };

const positiveVectorSchema = vector3Schema.refine(
  (v) => v.every((n) => n > 0),
  'Dimensions must be positive',
);
const transformSchema = z.object({ position: vector3Schema, rotation: vector3Schema });
export const assetMetadataSchema = z
  .object({
    id: z.enum(ASSET_IDS),
    version: z.number().int().positive(),
    label: z.string().min(1),
    anchor: z.enum(['floor-contact', 'floor-top', 'portal-entry']),
    facing: z.literal('+Z'),
    dimensions: positiveVectorSchema,
    bounds: z.object({ min: vector3Schema, max: vector3Schema }),
    footprint: z.array(point2Schema).min(3).refine(isSimplePolygon, 'Invalid asset footprint'),
    requiredNodes: z.array(z.string().min(1)).min(1),
    materialRoles: z.record(z.enum(['surface', 'frame', 'branding', 'glass', 'moving-part'])),
    sockets: z.record(transformSchema),
    colliders: z
      .array(
        z.object({
          halfExtents: positiveVectorSchema,
          position: vector3Schema,
          rotation: vector3Schema,
        }),
      )
      .min(1),
    source: z.object({
      blend: z.string().min(1),
      recipe: z.string().min(1),
      license: z.string().min(1),
      generatorVersion: z.string().min(1),
    }),
    budget: z.object({
      triangles: z.number().int().positive(),
      materials: z.number().int().positive(),
      bytes: z.number().int().positive(),
      textureSize: z.number().int().positive(),
    }),
    metrics: z.object({
      triangles: z.number().int().nonnegative(),
      materials: z.number().int().nonnegative(),
      bytes: z.number().int().nonnegative(),
      textureBytes: z.number().int().nonnegative(),
    }),
    portalRise: finiteNumberSchema.positive().optional(),
  })
  .superRefine((asset, ctx) => {
    for (const i of [0, 1, 2] as const) {
      if (
        Math.abs(asset.bounds.max[i] - asset.bounds.min[i] - asset.dimensions[i]) >
        asset.dimensions[i] * 0.01 + 0.00001
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dimensions', i],
          message: 'Dimensions disagree with exported bounds',
        });
      }
    }
    const contact = asset.anchor === 'floor-top' ? asset.bounds.max[1] : asset.bounds.min[1];
    if (Math.abs(contact) > 0.005) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['anchor'],
        message: 'Contact plane is not at root Y=0',
      });
    }
    for (const metric of ['triangles', 'materials', 'bytes'] as const) {
      if (asset.metrics[metric] > asset.budget[metric]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['metrics', metric],
          message: `${metric} exceeds budget`,
        });
      }
    }
    for (const name of Object.keys(asset.sockets)) {
      if (!asset.requiredNodes.includes(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sockets', name],
          message: 'Socket must be declared as a required node',
        });
      }
    }
  });
export type AssetMetadata = z.infer<typeof assetMetadataSchema>;
export const assetCatalogSchema = z.array(assetMetadataSchema).superRefine((items, ctx) => {
  const versions = new Set<string>();
  for (const [index, asset] of items.entries()) {
    const key = `${asset.id}@${asset.version}`;
    if (versions.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index],
        message: 'Duplicate asset version',
      });
    }
    versions.add(key);
  }
});
