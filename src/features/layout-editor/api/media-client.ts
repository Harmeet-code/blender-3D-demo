import { apiBaseUrl } from '@/api/base-url.ts';
import { z } from 'zod';
import { tilePyramidSchema } from '@/features/building/model/floor-tiles.ts';
import {
  revisionedAssetUrl,
  legacyMediaCacheUrl,
} from '@/features/assets/model/asset-response-cache.ts';

const mediaResponse = z.object({
  url: z.string(),
  originalUrl: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  originalWidth: z.number().optional(),
  originalHeight: z.number().optional(),
  tiles: tilePyramidSchema.optional(),
});
export async function uploadMedia(file: File) {
  const response = await fetch(`${apiBaseUrl()}/api/media`, {
    method: 'POST',
    headers: {
      'Content-Type': file.name.toLowerCase().endsWith('.glb') ? 'model/gltf-binary' : file.type,
    },
    body: file,
  });
  const json: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof json === 'object' && json !== null && 'error' in json
        ? String(json.error)
        : 'Upload failed',
    );
  }
  return mediaResponse.parse(json);
}
export function mediaUrl(url: string) {
  return legacyMediaCacheUrl(
    revisionedAssetUrl(
      url.startsWith('/api/')
        ? `${apiBaseUrl()}${url}`
        : url.startsWith('/floor-assets/')
          ? `${import.meta.env.BASE_URL}${url.slice(1)}`
          : url,
    ),
  );
}
