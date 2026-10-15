import { z } from 'zod';

/** Authored targets persist; animation phase/time stay outside undo and server revisions. */
export const circulationDesignSchema = z.object({
  layout: z.enum(['straight', 'switchback']).default('straight'),
  autoSize: z.boolean().default(true),
  clearWidth: z.number().finite().min(1.2).max(4).default(2),
  landingLength: z.number().finite().min(1.5).max(3).default(1.5),
  going: z.number().finite().min(0.25).max(0.32).default(0.28),
  slopeRatio: z.number().finite().min(12).max(20).default(12),
  nosing: z.enum(['green', 'yellow']).default('green'),
  running: z.boolean().default(true),
  direction: z.enum(['UP', 'DOWN']).default('UP'),
  speed: z.number().finite().min(0).max(0.75).default(0.5),
  cabinLevel: z.enum(['lower', 'upper']).default('lower'),
  doorsOpen: z.boolean().default(true),
  glass: z.boolean().default(true),
  showLandings: z.boolean().default(true),
  role: z.enum(['lower', 'upper']).default('lower'),
  snap: z.boolean().default(true),
});
export type CirculationDesign = z.infer<typeof circulationDesignSchema>;
export const DEFAULT_CIRCULATION = circulationDesignSchema.parse({});
