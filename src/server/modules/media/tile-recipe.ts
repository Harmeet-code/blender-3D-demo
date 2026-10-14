import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { tileBounds, type TilePyramid } from '@/features/building/model/floor-tiles.ts';

export async function imagePyramid(original: Buffer): Promise<TilePyramid> {
  const metadata = await sharp(original, { limitInputPixels: 150_000_000 }).metadata();
  const rotated = (metadata.orientation ?? 1) >= 5;
  const width = (rotated ? metadata.height : metadata.width)!;
  const height = (rotated ? metadata.width : metadata.height)!;
  return {
    template: '',
    width,
    height,
    tileSize: 512,
    maxLevel: Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / 512))),
  };
}

export async function encodePaddedTile(
  original: Buffer,
  pyramid: TilePyramid,
  level: number,
  x: number,
  y: number,
) {
  const bounds = tileBounds(pyramid, level, x, y);
  const left = Math.max(0, bounds.left - 1),
    top = Math.max(0, bounds.top - 1);
  const right = Math.min(bounds.width, bounds.right + 1),
    bottom = Math.min(bounds.height, bounds.bottom + 1);
  return sharp(original, { limitInputPixels: 150_000_000 })
    .rotate()
    .resize(bounds.width, bounds.height, { fit: 'fill' })
    .extract({ left, top, width: right - left, height: bottom - top })
    .webp({ quality: 94 })
    .toBuffer();
}

/** Encoder or pipeline changes create a new namespace without deleting any older tiles. */
export function tileRecipeFingerprint(
  implementation = [imagePyramid, encodePaddedTile, tileBounds]
    .map((fn) => fn.toString())
    .join('\n'),
  encoder = sharp.versions,
) {
  return createHash('sha256').update(JSON.stringify({ implementation, encoder })).digest('hex');
}
export const TILE_RECIPE = tileRecipeFingerprint();
export function tileCacheIdentity(sourceHash: string, recipeHash: string) {
  return createHash('sha256').update(`${sourceHash}:${recipeHash}`).digest('hex');
}
