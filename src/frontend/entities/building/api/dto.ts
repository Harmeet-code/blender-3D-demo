import { z } from 'zod';
import { buildingLayoutSchema } from '../model/building-schema.ts';

/**
 * Wire DTOs for the building slice. Single source of truth: backend services
 * validate responses with these, frontend clients parse responses with these.
 */
export const layoutResponseSchema = buildingLayoutSchema;

export const saveLayoutResponseSchema = z.object({
  saved: z.boolean(),
});
export type SaveLayoutResponse = z.infer<typeof saveLayoutResponseSchema>;
