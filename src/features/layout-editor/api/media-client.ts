import { apiBaseUrl } from '@/api/base-url.ts';
import { z } from 'zod';
import { venueAuthorizationHeaders } from '@/features/venue/model/venue-client.ts';
import { tilePyramidSchema } from '@/features/building/model/floor-tiles.ts';
import { floorPlanBuilderHeaders } from '@/features/building/api/builder-layout-policy.ts';
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
  return postMedia(file, venueAuthorizationHeaders());
}

/** Upload for the active builder's implicit local-admin session (no Venue OS credential). */
export async function uploadBuilderMedia(file: File) {
  return postMedia(file, floorPlanBuilderHeaders());
}

async function postMedia(file: File, authHeaders: Record<string, string>) {
  const response = await fetch(`${apiBaseUrl()}/api/media`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': file.name.toLowerCase().endsWith('.glb') ? 'model/gltf-binary' : file.type,
    },
    body: file,
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? 'Sign in before uploading an image. Your session may have expired.'
        : typeof json === 'object' &&
            json !== null &&
            'message' in json &&
            typeof json.message === 'string'
          ? json.message
          : typeof json === 'object' &&
              json !== null &&
              'error' in json &&
              typeof json.error === 'string'
            ? json.error
            : `Upload failed (${response.status}). Check that the backend is running and try again.`,
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
