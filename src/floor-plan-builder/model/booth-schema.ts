import { z } from 'zod';

export const boothColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
export const boothEdgeSchema = z.object({
  edge: z.number().int().min(0).max(255),
  mode: z.enum(['wall', 'open', 'entrance']),
  width: z.union([z.literal(1.2), z.literal(2)]).default(1.2),
});
/** Optional on old recipes: reading a legacy document must not introduce new placement limits. */
export const boothDesignSchema = z.object({
  layout: z.enum(['enclosed', 'inline', 'corner', 'peninsula', 'island', 'custom']).default('inline'),
  roof: z.enum(['open', 'truss', 'solid']).default('open'),
  edges: z.array(boothEdgeSchema).max(256).default([]),
  primaryColor: boothColorSchema.default('#F8F9FA'),
  surfaceColors: z
    .record(
      z.string().regex(/^(floor|wall-\d+-(inner|outer)|header-\d+|plinth-\d+)$/),
      boothColorSchema,
    )
    .refine((colors) => Object.keys(colors).length <= 128, 'Use at most 128 surface overrides.')
    .default({}),
  storage: z.boolean().default(false),
  closetDoorOpen: z.boolean().default(false),
  snap: z.boolean().default(true),
  clearance: z.number().finite().min(0).max(1).default(0.1),
});
export type BoothDesign = z.infer<typeof boothDesignSchema>;
export const DEFAULT_BOOTH_DESIGN = boothDesignSchema.parse({});
