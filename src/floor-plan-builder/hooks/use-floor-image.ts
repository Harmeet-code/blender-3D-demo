import { useEffect, useState } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { mediaUrl } from '@/features/layout-editor/api/media-client.ts';
import type { SurfacePixels } from '../model/surface-color.ts';
import type { PlanFloor } from '../model/types.ts';
import { decodedImageSize } from '../model/floor-image.ts';

export function useFloorImage(floor: PlanFloor) {
  const url = floor.source.authoring?.originalImage ?? floor.source.image;
  const [image, setImage] = useState<{
    url: string;
    texture: CanvasTexture | null;
    pixels: SurfacePixels | null;
    size: [number, number] | null;
    error: string;
  }>(() => ({ url, texture: null, pixels: null, size: null, error: '' }));
  useEffect(() => {
    // Blank floors need no image work. Keep the passive setup free of state
    // writes for an empty URL; Strict Mode intentionally replays this setup.
    if (!url) return;
    let alive = true;
    let texture: CanvasTexture | null = null;
    setImage((current) =>
      current.url === url && !current.texture && !current.pixels && !current.error
        ? current
        : { url, texture: null, pixels: null, size: null, error: '' },
    );
    const source = new Image();
    source.crossOrigin = 'anonymous';
    source.onload = () => {
      if (!alive) {
        return;
      }
      try {
        const canvas = document.createElement('canvas');
        const decodedSize = decodedImageSize(source.naturalWidth, source.naturalHeight);
        if (!decodedSize) throw new Error('Invalid floor image dimensions.');
        canvas.width = decodedSize[0];
        canvas.height = decodedSize[1];
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          throw new Error('Image pixels unavailable.');
        }
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        setImage({
          url,
          texture,
          pixels: {
            width: canvas.width,
            height: canvas.height,
            data,
            originalSize: [source.naturalWidth, source.naturalHeight],
          },
          size: [source.naturalWidth, source.naturalHeight],
          error: '',
        });
      } catch {
        setImage({
          url,
          texture: null,
          pixels: null,
          size: null,
          error: 'The floor image cannot be sampled. Booths use their fallback color.',
        });
      }
    };
    source.onerror = () => {
      if (alive) {
        setImage({
          url,
          texture: null,
          pixels: null,
          size: null,
          error: 'Floor image failed to load. Replace it or use the fallback surface.',
        });
      }
    };
    source.src = mediaUrl(url);
    return () => {
      alive = false;
      source.onload = null;
      source.onerror = null;
      texture?.dispose();
    };
  }, [url]);
  // A prior floor's decoded image is retained only until its request cleanup
  // runs; never expose it while the selected floor has a different URL.
  return image.url === url
    ? image
    : { url, texture: null, pixels: null, size: null, error: '' };
}
