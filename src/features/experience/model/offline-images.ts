import type { BuildingLayout } from '@/features/building/model/building-schema.ts';
import { mediaUrl } from '@/features/layout-editor/api/media-client.ts';
import {
  revisionedAssetUrl,
  isImmutableAsset,
} from '@/features/assets/model/asset-response-cache.ts';
let registration: Promise<ServiceWorkerRegistration> | undefined;
export function registerFloorImageCache() {
  if (!('serviceWorker' in navigator)) {
    return Promise.reject(new Error('Offline image storage is unavailable in this browser.'));
  }
  registration ??= navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}floor-image-worker.js`, {
      scope: import.meta.env.BASE_URL,
      updateViaCache: 'none',
    })
    .catch((error) => {
      registration = undefined;
      throw error;
    });
  return registration;
}
async function message(
  payload: unknown,
): Promise<{ saved?: number; requested?: number; error?: string }> {
  await registerFloorImageCache();
  const ready = await navigator.serviceWorker.ready;
  if (!ready.active) {
    throw new Error('Offline image worker is not ready.');
  }
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error('Saving images timed out. Try again after loading the venue.'));
    }, 120_000);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      event.data.error ? reject(new Error(event.data.error)) : resolve(event.data);
    };
    ready.active!.postMessage(payload, [channel.port2]);
  });
}
export async function saveFloorImages(layout: BuildingLayout) {
  const urls = [
    ...new Set(
      layout.floors
        .filter((floor) => !!floor.image)
        .map((floor) => revisionedAssetUrl(mediaUrl(floor.image))),
    ),
  ];
  const immutable = urls.filter((url) => isImmutableAsset(url));
  const result = await message({ type: 'SAVE_IMAGES', urls: immutable });
  return {
    saved: result.saved ?? 0,
    requested: urls.length,
    unsupported: urls.length - immutable.length,
  };
}
export function clearFloorImages() {
  return message({ type: 'CLEAR_IMAGES' });
}
