import { z } from 'zod';

/**
 * Authored parking-lot parameters. The layout engine recomputes every bay from
 * the polygon footprint plus these values, so nothing derived is persisted.
 */
export const parkingDesignSchema = z.object({
  /** Bay angle relative to the drive aisle; drives stall width/depth and aisle rules. */
  bayAngle: z.enum(['90', '60', '45', 'parallel']).default('90'),
  /** One-way aisles are narrower; two-way is the default. */
  oneWay: z.boolean().default(false),
  /** Manual aisle width override in metres; null derives it from the bay-angle rules table. */
  aisleWidth: z.number().finite().min(3).max(12).nullable().default(null),
  /** Baseline rotation in radians; null aligns the rows with the longest boundary edge. */
  baselineAngle: z.number().finite().min(-Math.PI).max(Math.PI).nullable().default(null),
  /** Perimeter inset margin establishing curbs and drainage gutters. */
  margin: z.number().finite().min(0.5).max(3).default(1.2),
  /** Fraction of stalls pseudorandomly filled with vehicles, derived from `seed`. */
  occupancy: z.number().finite().min(0).max(1).default(0.35),
  seed: z.number().int().min(1).max(9999).default(42),
  showVehicles: z.boolean().default(true),
  showPoles: z.boolean().default(true),
  /** Render a capacity/utilization overlay over the generated stall manifest. */
  heatmap: z.boolean().default(false),
  /**
   * Manual bay overrides keyed by fractional (u, v) coordinates of the lot
   * bounding box, e.g. "0.42,0.10": "ev" or { type: "ev", pinned: true }.
   * Legacy string values remain supported; coordinate keys survive re-layout.
   */
  overrides: z
    .record(
      z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/),
      z.union([
        z.enum(['standard', 'accessible', 'ev', 'motorcycle', 'vip', 'loading']),
        z.object({
          type: z.enum(['standard', 'accessible', 'ev', 'motorcycle', 'vip', 'loading']),
          pinned: z.boolean().default(true),
        }),
      ]),
    )
    .default({}),
});
export type ParkingDesign = z.infer<typeof parkingDesignSchema>;
export const DEFAULT_PARKING = parkingDesignSchema.parse({});
