import { z } from 'zod';
export const tilePyramidSchema = z.object({
  template: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tileSize: z.literal(512),
  maxLevel: z.number().int().min(0).max(8),
});
export type TilePyramid = z.infer<typeof tilePyramidSchema>;
export function tileBounds(pyramid: TilePyramid, level: number, x: number, y: number) {
  const factor = 2 ** (pyramid.maxLevel - level);
  const width = Math.ceil(pyramid.width / factor),
    height = Math.ceil(pyramid.height / factor);
  const left = x * pyramid.tileSize,
    top = y * pyramid.tileSize;
  if (
    !Number.isInteger(level) ||
    level < 0 ||
    level > pyramid.maxLevel ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    left >= width ||
    top >= height
  ) {
    throw new Error('Tile outside pyramid');
  }
  const right = Math.min(width, left + pyramid.tileSize),
    bottom = Math.min(height, top + pyramid.tileSize);
  return {
    width,
    height,
    left,
    top,
    right,
    bottom,
    u0: left / width,
    v0: top / height,
    u1: right / width,
    v1: bottom / height,
  };
}
