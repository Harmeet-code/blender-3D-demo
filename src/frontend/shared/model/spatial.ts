import { z } from 'zod';

export const finiteNumberSchema = z.number().finite();
export const point2Schema = z.tuple([finiteNumberSchema, finiteNumberSchema]);
export const vector3Schema = z.tuple([finiteNumberSchema, finiteNumberSchema, finiteNumberSchema]);
export const assetReferenceSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
});
export type AssetReference = z.infer<typeof assetReferenceSchema>;
