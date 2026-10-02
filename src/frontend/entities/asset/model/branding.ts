import { err, ok, type Result } from 'neverthrow';
export interface Logo {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  name: string;
}
export interface LogoError {
  code: 'INVALID_LOGO';
  message: string;
}
export async function decodeLogo(file: File): Promise<Result<Logo, LogoError>> {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 2 * 1024 * 1024 ||
    !file.size
  ) {
    return err({ code: 'INVALID_LOGO', message: 'Choose PNG, JPEG, or WebP up to 2 MiB.' });
  }
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height || bitmap.width > 2048 || bitmap.height > 2048) {
      return err({
        code: 'INVALID_LOGO',
        message: 'Logo dimensions must be between 1 and 2048 pixels.',
      });
    }
    // Twenty active square logos stay below 27 MiB including mipmaps.
    const factor = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * factor));
    canvas.height = Math.max(1, Math.round(bitmap.height * factor));
    const context = canvas.getContext('2d');
    if (!context) {
      return err({ code: 'INVALID_LOGO', message: 'Could not prepare the logo image.' });
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // The display aspect uses the source dimensions; pixel rounding during resizing must not distort it.
    return ok({ canvas, width: bitmap.width, height: bitmap.height, name: file.name });
  } catch {
    return err({
      code: 'INVALID_LOGO',
      message: 'This image could not be decoded. Choose another file.',
    });
  } finally {
    bitmap?.close();
  }
}
