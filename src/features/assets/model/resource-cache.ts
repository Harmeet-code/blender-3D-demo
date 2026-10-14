import { useGLTF, useTexture } from '@react-three/drei';
import type { BufferGeometry, Material } from 'three';
import { Mesh, Texture, LoaderUtils, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { releaseTiles } from '@/features/world/model/tile-cache.ts';
import { assetAdmission } from '@/features/world/model/work-admission.ts';
import { fetchAssetBytes, assetResponseCacheSnapshot } from './asset-response-cache.ts';
import { createProceduralAsset } from '../catalog/procedural-assets.ts';

const requests = new Map<string, { abort: AbortController; scene?: Object3D }>();
const mapRequests = new Set<string>();
const trackedLoaders = new WeakSet<object>();
let discardedDecodes = 0;
/** Extend Drei's shared loader once. All GLB fetch/decode jobs use the same admission pool as tiles. */
export const trackAssetLoader: NonNullable<Parameters<typeof useGLTF>[3]> = (loader) => {
  if (trackedLoaders.has(loader)) {
    return;
  }
  trackedLoaders.add(loader);
  loader.load = (url, onLoad, onProgress, onError) => {
    const request = { abort: new AbortController(), scene: undefined as Object3D | undefined };
    requests.set(url, request);
    let completed = false;
    let reported = false;
    loader.manager.itemStart(url);
    const report = (error?: unknown) => {
      if (reported) {
        return;
      }
      reported = true;
      if (error && !request.abort.signal.aborted) {
        loader.manager.itemError(url);
      }
      loader.manager.itemEnd(url);
    };
    void assetAdmission
      .run(async () => {
        const resolvedUrl = loader.manager.resolveURL(loader.path + url);
        const bytes = await fetchAssetBytes(resolvedUrl, {
          signal: request.abort.signal,
          headers: loader.requestHeader,
          credentials: loader.withCredentials ? 'include' : 'same-origin',
        });
        onProgress?.(
          new ProgressEvent('progress', {
            lengthComputable: true,
            loaded: bytes.byteLength,
            total: bytes.byteLength,
          }),
        );
        const base =
          loader.resourcePath ||
          (loader.path
            ? LoaderUtils.resolveURL(LoaderUtils.extractUrlBase(url), loader.path)
            : LoaderUtils.extractUrlBase(url));
        const result = await loader.parseAsync(bytes, base);
        completed = true;
        if (request.abort.signal.aborted) {
          disposeScene(result.scene);
          discardedDecodes++;
        } else {
          request.scene = result.scene;
          const owner = sharedEntry(url, result.scene);
          if (!common.has(url)) {
            common.set(url, owner);
          }
          scheduleCommonTrim();
        }
        onLoad(result);
        report();
      }, request.abort.signal)
      .catch((error) => {
        report(error);
        if (!completed) {
          onError?.(error);
        }
      });
  };
};
export function trackMapRequest(url: string) {
  mapRequests.add(url);
}

interface SharedEntry {
  url: string;
  scene: Object3D;
  refs: number;
  bytes: number;
  lastUsed: number;
  dispose?: () => void;
  compiled?: Array<{ material: Material; geometry: BufferGeometry; independent?: boolean }>;
}
const common = new Map<string, SharedEntry>();
const owners = new WeakMap<Object3D, SharedEntry>();
const detachedOwners = new Set<SharedEntry>();
const COMMON_CACHE_BYTES = 128 * 1024 * 1024;
const COMMON_CACHE_ENTRIES = 24;
let trimTimer: ReturnType<typeof setTimeout> | undefined;
// Retirement frees GPU resources immediately, but a concurrent React render may
// still own the source graph. Keep ImageBitmaps valid until that graph is collected.
const imageFinalizer =
  typeof FinalizationRegistry === 'undefined'
    ? null
    : new FinalizationRegistry<ImageBitmap[]>((images) => images.forEach((image) => image.close()));
function geometryBytes(geometry: BufferGeometry) {
  return Object.values(geometry.attributes).reduce(
    (bytes, attribute) => bytes + attribute.array.byteLength,
    geometry.index?.array.byteLength ?? 0,
  );
}
function sharedEntry(url: string, scene: Object3D): SharedEntry {
  const owned = owners.get(scene);
  if (owned) {
    owned.lastUsed = performance.now();
    return owned;
  }
  const geometries = new Set<BufferGeometry>(),
    textures = new Set<Texture>(),
    images = new Set<ImageBitmap>();
  scene.traverse((node) => {
    if (!(node instanceof Mesh)) {
      return;
    }
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture) {
          textures.add(value);
        }
      }
    }
  });
  let bytes = [...geometries].reduce((sum, geometry) => sum + geometryBytes(geometry), 0);
  for (const texture of textures) {
    bytes += (Number(texture.image?.width ?? 0) * Number(texture.image?.height ?? 0) * 4 * 4) / 3;
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) {
      images.add(texture.image);
    }
  }
  if (images.size) {
    imageFinalizer?.register(scene, [...images]);
  }
  const entry: SharedEntry = { url, scene, refs: 0, bytes, lastUsed: performance.now() };
  owners.set(scene, entry);
  return entry;
}
function retireCommon(entry: SharedEntry) {
  if (entry.refs) {
    return;
  }
  disposeScene(entry.scene, false);
  entry.compiled?.forEach(({ geometry }) => geometry.dispose());
  if (common.get(entry.url) === entry) {
    common.delete(entry.url);
    if (!isProceduralAssetUrl(entry.url)) {
      useGLTF.clear(entry.url);
    }
  }
  if (requests.get(entry.url)?.scene === entry.scene) {
    requests.delete(entry.url);
  }
  detachedOwners.delete(entry);
}
function scheduleCommonTrim() {
  clearTimeout(trimTimer);
  // No eviction during render. Source ownership survives retirement via the
  // weak graph index, so a suspended render can commit without adopting another revision.
  trimTimer = setTimeout(() => {
    let bytes = [...common.values(), ...detachedOwners].reduce(
      (sum, entry) => sum + entry.bytes,
      0,
    );
    let deferred = false;
    const now = performance.now();
    for (const entry of [...common.values()].sort((a, b) => a.lastUsed - b.lastUsed)) {
      if (entry.refs || (common.size <= COMMON_CACHE_ENTRIES && bytes <= COMMON_CACHE_BYTES)) {
        continue;
      }
      // Allow a decoded or concurrently rendered graph to commit before clearing
      // its loader key. Retirement remains safe if a render outlives this grace.
      if (now - entry.lastUsed < 1500) {
        deferred = true;
        continue;
      }
      bytes -= entry.bytes;
      retireCommon(entry);
    }
    if (deferred && viewers) {
      trimTimer = setTimeout(scheduleCommonTrim, 1500);
    }
  }, 0);
}
export const isProceduralAssetUrl = (url: string) => url.startsWith('procedural:');
/** One recipe owner per identity/quality. Clones and batches borrow its resources. */
export function proceduralAssetScene(url: string): Object3D {
  const cached = common.get(url);
  if (cached) {
    cached.lastUsed = performance.now();
    return cached.scene;
  }
  const match = /^procedural:([a-z0-9-]+)@1:(baseline|low|opaque)$/.exec(url);
  if (!match) {
    throw new Error(`Invalid procedural asset reference: ${url}`);
  }
  const asset = createProceduralAsset(match[1]!, match[2] !== 'baseline');
  if (!asset) {
    throw new Error(`Unknown procedural asset: ${match[1]}`);
  }
  const entry = sharedEntry(url, asset.scene);
  entry.dispose = asset.dispose;
  common.set(url, entry);
  return asset.scene;
}
const maps = new Map<string, { refs: number; texture: Texture; at: number; bytes: number }>();
function releaseMap(url: string) {
  const entry = maps.get(url);
  if (!entry || entry.refs) {
    return;
  }
  entry.texture.dispose();
  entry.texture.image?.close?.();
  useTexture.clear(url);
  maps.delete(url);
}
export function retainMapTexture(url: string, texture: Texture) {
  const entry = maps.get(url) ?? {
    refs: 0,
    texture,
    at: 0,
    bytes: (Number(texture.image?.width ?? 0) * Number(texture.image?.height ?? 0) * 4 * 4) / 3,
  };
  entry.refs++;
  entry.at = performance.now();
  maps.set(url, entry);
  return () => {
    entry.refs = Math.max(0, entry.refs - 1);
    entry.at = performance.now();
    let bytes = [...maps.values()].reduce((sum, value) => sum + value.bytes, 0);
    for (const [key, value] of [...maps].sort((a, b) => a[1].at - b[1].at)) {
      if (!value.refs && (maps.size > 2 || bytes > 96 * 1024 * 1024)) {
        bytes -= value.bytes;
        releaseMap(key);
      }
    }
  };
}
const floors = new Map<string, { refs: number; lastUsed: number; dispose: Set<() => void> }>();
let viewers = 0;
let shutdown: ReturnType<typeof setTimeout> | undefined;
const disposeScene = (scene: Object3D, closeImages = true) => {
  const geometries = new Set<BufferGeometry>(),
    materials = new Set<Material>(),
    textures = new Set<Texture>();
  scene.traverse((node) => {
    if (!(node instanceof Mesh)) {
      return;
    }
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof Texture) {
          textures.add(value);
        }
      }
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => {
    texture.dispose();
    if (closeImages && typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) {
      texture.image.close();
    }
  });
};
export function retainViewer() {
  clearTimeout(shutdown);
  viewers++;
  return () => {
    viewers--;
    shutdown = setTimeout(() => {
      if (viewers) {
        return;
      }
      clearTimeout(trimTimer);
      const disposed = new Set<Object3D>();
      for (const [url, entry] of common) {
        if (entry.refs) {
          continue;
        }
        if (entry.dispose) {
          entry.dispose();
        } else {
          disposeScene(entry.scene);
        }
        disposed.add(entry.scene);
        entry.compiled?.forEach(({ geometry }) => geometry.dispose());
        if (!isProceduralAssetUrl(url)) {
          useGLTF.clear(url);
        }
        common.delete(url);
      }
      for (const entry of detachedOwners) {
        if (!entry.refs) {
          retireCommon(entry);
        }
      }
      for (const [url, request] of requests) {
        if (common.get(url)?.refs) {
          continue;
        }
        request.abort.abort();
        if (request.scene && !disposed.has(request.scene)) {
          disposeScene(request.scene);
        }
        useGLTF.clear(url);
        requests.delete(url);
      }
      for (const entry of floors.values()) {
        entry.dispose.forEach((dispose) => dispose());
      }
      floors.clear();
      releaseTiles();
      for (const url of maps.keys()) {
        releaseMap(url);
      }
      for (const url of mapRequests) {
        if (!maps.get(url)?.refs) {
          useTexture.clear(url);
          mapRequests.delete(url);
        }
      }
    }, 0);
  };
}
export function retainCommon(url: string, scene: Object3D) {
  const entry = sharedEntry(url, scene);
  entry.refs++;
  if (!common.has(url) || common.get(url) === entry) {
    common.set(url, entry);
  } else {
    detachedOwners.add(entry);
  }
  scheduleCommonTrim();
  return () => {
    entry.refs = Math.max(0, entry.refs - 1);
    entry.lastUsed = performance.now();
    if (!entry.refs && common.get(url) !== entry) {
      retireCommon(entry);
    } else {
      scheduleCommonTrim();
    }
  };
}
/** Compiled copies belong to the common kit, never to a floor or an individual instance. */
export function compiledPrimitives(url: string, scene: Object3D) {
  const entry = sharedEntry(url, scene);
  if (!common.has(url)) {
    common.set(url, entry);
  }
  if (entry.compiled) {
    return entry.compiled;
  }
  scene.updateMatrixWorld(true);
  const byMaterial = new Map<
    string,
    { material: Material; parts: BufferGeometry[]; independent: boolean }
  >();
  scene.traverse((node) => {
    if (!(node instanceof Mesh)) {
      return;
    }
    if (Array.isArray(node.material)) {
      throw new Error('Batch source requires one material per primitive');
    }
    if ('isSkinnedMesh' in node || node.morphTargetInfluences?.length) {
      throw new Error('Skinned and morphed sources require independent hierarchy rendering');
    }
    // Blender details can share a material while retaining different UV layouts.
    const signature = Object.keys(node.geometry.attributes)
      .sort()
      .map((name) => {
        const attribute = node.geometry.getAttribute(name);
        return `${name}:${attribute.itemSize}:${attribute.normalized}`;
      })
      .join('|');
    const independent =
      node.material.transparent ||
      ('transmission' in node.material && Number(node.material.transmission) > 0);
    const key = `${node.material.uuid}:${signature}:${!!node.geometry.index}:${independent ? node.uuid : ''}`;
    const group = byMaterial.get(key) ?? {
      material: node.material,
      parts: [] as BufferGeometry[],
      independent,
    };
    group.parts.push(node.geometry.clone().applyMatrix4(node.matrixWorld));
    byMaterial.set(key, group);
  });
  const compiled: NonNullable<SharedEntry['compiled']> = [];
  try {
    for (const { material, parts, independent } of byMaterial.values()) {
      const geometry = mergeGeometries(parts, false);
      if (!geometry) {
        throw new Error('Incompatible attributes in batch geometry');
      }
      geometry.computeBoundingBox();
      compiled.push({ material, geometry, independent });
    }
    entry.compiled = compiled;
    entry.bytes += compiled.reduce((bytes, part) => bytes + geometryBytes(part.geometry), 0);
    return compiled;
  } catch (error) {
    compiled.forEach((part) => part.geometry.dispose());
    throw error;
  } finally {
    byMaterial.forEach(({ parts }) => parts.forEach((part) => part.dispose()));
  }
}
export function retainFloor(id: string) {
  const entry = floors.get(id) ?? { refs: 0, lastUsed: 0, dispose: new Set<() => void>() };
  entry.refs++;
  entry.lastUsed = performance.now();
  floors.set(id, entry);
  return () => {
    entry.refs--;
    const unused = [...floors]
      .filter(([, value]) => !value.refs)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    while (floors.size > 2 && unused.length) {
      const oldest = unused.shift();
      if (!oldest) {
        break;
      }
      oldest[1].dispose.forEach((dispose) => dispose());
      floors.delete(oldest[0]);
    }
  };
}
export function cacheSnapshot() {
  return {
    admission: assetAdmission.snapshot(),
    responses: assetResponseCacheSnapshot(),
    requestedModels: requests.size,
    discardedDecodes,
    requestedMaps: mapRequests.size,
    commonEntries: common.size,
    detachedCommonEntries: detachedOwners.size,
    commonEstimatedBytes: [...common.values(), ...detachedOwners].reduce(
      (bytes, entry) => bytes + entry.bytes,
      0,
    ),
    commonCacheBudgetBytes: COMMON_CACHE_BYTES,
    mapEntries: maps.size,
    mapUsers: [...maps.values()].reduce((sum, entry) => sum + entry.refs, 0),
    commonUsers: [...common.values(), ...detachedOwners].reduce(
      (sum, entry) => sum + entry.refs,
      0,
    ),
    floorSets: [...floors].map(([id, entry]) => ({ id, users: entry.refs })),
  };
}
if (
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('startup-profile')
) {
  (
    globalThis as typeof globalThis & { __ASSET_LOADING_SNAPSHOT__?: typeof cacheSnapshot }
  ).__ASSET_LOADING_SNAPSHOT__ = cacheSnapshot;
}
