import { useEffect, useState } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { mediaUrl } from '@/features/layout-editor/api/media-client.ts';
import type { SurfacePixels } from '../model/surface-color.ts';
import type { PlanFloor } from '../model/types.ts';

export function useFloorImage(floor: PlanFloor) {
  const url = floor.source.authoring?.originalImage ?? floor.source.image;
  const [image, setImage] = useState<{
    texture: CanvasTexture | null;
    pixels: SurfacePixels | null;
    size: [number, number] | null;
    error: string;
  }>({ texture: null, pixels: null, size: null, error: '' });
  useEffect(() => {
    let alive = true;
    let texture: CanvasTexture | null = null;
    setImage({ texture: null, pixels: null, size: null, error: '' });
    if (!url) {
      return;
    }
    const source = new Image();
    source.crossOrigin = 'anonymous';
    source.onload = () => {
      if (!alive) {
        return;
      }
      try {
        const canvas = document.createElement('canvas');
        const ratio = Math.min(1, 2048 / Math.max(source.naturalWidth, source.naturalHeight));
        canvas.width = Math.max(1, Math.round(source.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(source.naturalHeight * ratio));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          throw new Error('Image pixels unavailable.');
        }
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        setImage({
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
  return image;
}
