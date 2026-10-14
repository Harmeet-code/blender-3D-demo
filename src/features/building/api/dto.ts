import { z } from 'zod';
import { buildingLayoutSchema } from '@/features/building/model/building-schema.ts';

/**
 * Wire DTOs for the building slice. Single source of truth: backend services
 * validate responses with these, frontend clients parse responses with these.
 */
export const layoutResponseSchema = buildingLayoutSchema;
export const draftLayoutResponseSchema = buildingLayoutSchema.nullable();
export type DraftLayoutResponse = z.infer<typeof draftLayoutResponseSchema>;

export const saveLayoutResponseSchema = z.object({
  saved: z.boolean(),
});
export type SaveLayoutResponse = z.infer<typeof saveLayoutResponseSchema>;
