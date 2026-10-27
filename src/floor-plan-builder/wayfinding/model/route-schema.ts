import { z } from 'zod';

const point2 = z.tuple([z.number().finite(), z.number().finite()]);
const point3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

export const routeEndpointSchema = z
  .object({
    floorId: z.string().min(1),
    kind: z.enum(['point', 'item']),
    /** Raw click position (kind point). */
    point: point2.optional(),
    /** Item id (kind item); resolved to the item's access point, never its centre. */
    itemId: z.string().min(1).max(256).optional(),
  })
  .refine((endpoint) => (endpoint.kind === 'item' ? !!endpoint.itemId : !!endpoint.point), {
    message: 'An item endpoint needs itemId; a floor endpoint needs a point.',
  });

export const routeRequestSchema = z.object({
  start: routeEndpointSchema,
  dest: routeEndpointSchema,
  accessibleOnly: z.boolean().default(false),
  allowRestricted: z.boolean().default(false),
});

export const routeSegmentSchema = z.object({
  kind: z.enum(['walk', 'stairs', 'ramp', 'elevator', 'escalator']),
  floorId: z.string().min(1),
  toFloorId: z.string().min(1).optional(),
  connectorId: z.string().min(1).optional(),
  points: z.array(point3).min(1).max(4096),
  lengthM: z.number().finite().min(0),
  seconds: z.number().finite().min(0),
});

export const routeResultSchema = z.object({
  waypoints: z.array(point3).min(2).max(4096),
  segments: z.array(routeSegmentSchema).min(1).max(64),
  lengthM: z.number().finite().min(0),
  secondsEta: z.number().finite().min(0),
  instructions: z.array(z.string().max(280)).max(64),
  option: z.enum(['shortest', 'accessible']),
  snapped: z.object({ start: z.boolean(), dest: z.boolean() }),
  warnings: z.array(z.string().max(280)).max(16).default([]),
});

export type RouteRequest = z.infer<typeof routeRequestSchema>;
export type RouteResult = z.infer<typeof routeResultSchema>;
export type RouteSegment = z.infer<typeof routeSegmentSchema>;

/** Detour area ids painted per zone polygon (0 = default walkable). */
export const navAreaSchema = z.object({
  polygon: z.array(point2).min(3).max(256),
  area: z.number().int().min(1).max(63),
  flags: z.number().int().min(1).max(0xffff),
});
export type NavAreaPaint = z.infer<typeof navAreaSchema>;

export const areaFilterSchema = z.object({
  includeFlags: z.number().int().min(0).max(0xffff).default(0xffff),
  excludeFlags: z.number().int().min(0).max(0xffff).default(0),
  areaCosts: z
    .array(z.tuple([z.number().int().min(0).max(63), z.number().finite().min(0)]))
    .max(64)
    .default([]),
});
export type AreaFilter = z.infer<typeof areaFilterSchema>;

/** Additive worker extension: all fields optional so old callers are unaffected. */
export const wayfindingRouteOptionsSchema = z.object({
  enabledPortalTypes: z.array(z.string()).optional(),
  queryFilter: areaFilterSchema.optional(),
  straight: z.boolean().default(false),
});
export type WayfindingRouteOptions = z.infer<typeof wayfindingRouteOptionsSchema>;

/** Validate anything crossing the worker boundary; fail soft, never throw into render. */
export function parseWorkerRoute(value: unknown):
  | {
      ok: true;
      points: [number, number, number][];
      floors: string[];
      straight?: [number, number, number][];
      straightFloors?: string[];
      buildMs?: number;
    }
  | { ok: false; error: string } {
  const parsed = z
    .object({
      points: z.array(point3).max(8192),
      floors: z.array(z.string()).max(8192),
      straight: z.array(point3).max(8192).optional(),
      straightFloors: z.array(z.string().min(1)).max(8192).optional(),
      buildMs: z.number().finite().min(0).optional(),
    })
    .safeParse(value);
  if (
    !parsed.success ||
    !parsed.data.points.length ||
    parsed.data.floors.length !== parsed.data.points.length ||
    (parsed.data.straight &&
      parsed.data.straightFloors &&
      parsed.data.straight.length !== parsed.data.straightFloors.length)
  ) {
    return { ok: false, error: 'Malformed route payload from navigation worker.' };
  }
  return {
    ok: true,
    points: parsed.data.points as [number, number, number][],
    floors: parsed.data.floors,
    straight: parsed.data.straight as [number, number, number][] | undefined,
    ...(parsed.data.straightFloors ? { straightFloors: parsed.data.straightFloors } : {}),
    buildMs: parsed.data.buildMs,
  };
}
