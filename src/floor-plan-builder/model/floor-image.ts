export { fitFloorImage, type FloorImageFit } from '@/features/building/model/floor-image-fit.ts';

export const MAX_DECODED_IMAGE_EDGE = 2048;
const SUPPORTED_TYPES = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);

export type FloorImageValidation =
  | { ok: true; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' }
  | { ok: false; message: string };

/** Validate an upload before replacing the currently referenced floor image. */
export function validateFloorImage(file: { name: string; type: string }): FloorImageValidation {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const extensionType = SUPPORTED_TYPES.get(extension);
  const mimeType = file.type.trim().toLowerCase() || extensionType;
  if (!mimeType || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
    return { ok: false, message: 'Choose a PNG, JPEG, or WebP floor image.' };
  }
  if (extensionType && extensionType !== mimeType) {
    return { ok: false, message: 'The floor image extension does not match its file type.' };
  }
  if (!extensionType && file.name.includes('.')) {
    return { ok: false, message: 'Choose a PNG, JPEG, or WebP floor image.' };
  }
  return { ok: true, mimeType: mimeType as 'image/png' | 'image/jpeg' | 'image/webp' };
}

/** Size for decoded canvas sampling; callers should retain the original natural dimensions separately. */
export function decodedImageSize(
  width: number,
  height: number,
  maxEdge = MAX_DECODED_IMAGE_EDGE,
): [number, number] | null {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(maxEdge) ||
    width <= 0 ||
    height <= 0 ||
    maxEdge <= 0
  ) {
    return null;
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

