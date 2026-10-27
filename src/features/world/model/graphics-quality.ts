/** The active venue renderer has one supported quality setting: High. */
export type GraphicsTier = 'high';

export const GRAPHICS = {
  high: { dpr: 1.5, shadowSize: 2048 },
} as const;
