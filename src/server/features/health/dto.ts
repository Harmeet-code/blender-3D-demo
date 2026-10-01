import { z } from 'zod';

/** Wire DTO for the health endpoint. */
export const depStatusSchema = z.enum(['up', 'down', 'unconfigured']);
export type DepStatus = z.infer<typeof depStatusSchema>;

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  uptime: z.number(),
  deps: z.object({
    postgres: depStatusSchema,
    redis: depStatusSchema,
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
