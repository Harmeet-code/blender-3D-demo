import manifestJson from './mall-manifest.json';
import type { MallSceneData, MallSceneManifest } from './mall-types.ts';
import { createMallScene, type MallSceneResources } from './mall-scene.ts';

const manifest = manifestJson as MallSceneManifest;
let sceneDataPromise: Promise<MallSceneData> | null = null;
let sceneResourcesPromise: Promise<MallSceneResources> | null = null;
let activeResources: MallSceneResources | null = null;
let sceneLoadOwners = 0;
let resourceConsumers = 0;
let idleTimer: number | null = null;
let cacheGeneration = 0;
let nextFetchCache: RequestCache = 'force-cache';

function sceneUrl(): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${manifest.url.replace(/^\/+/, '')}`;
}

async function fetchSceneData(): Promise<MallSceneData> {
  const cache = nextFetchCache;
  nextFetchCache = 'force-cache';
  const response = await fetch(sceneUrl(), { cache });
  if (!response.ok) {
    throw new Error(`Could not load procedural mall data (${response.status}).`);
  }
  const downloaded = await response.arrayBuffer();
  const header = new Uint8Array(downloaded, 0, Math.min(2, downloaded.byteLength));
  let bytes = downloaded;
  if (header[0] === 0x1f && header[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error(
        'This browser cannot open the compressed procedural mall scene. Update to a browser with gzip decompression support.',
      );
    }
    const source = new Blob([downloaded]).stream();
    bytes = await new Response(source.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  if (globalThis.crypto?.subtle && manifest.sha256) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const actualHash = Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('');
    if (actualHash !== manifest.sha256.toLowerCase()) {
      throw new Error('The procedural mall data failed its content hash check.');
    }
  }
  const scene = JSON.parse(new TextDecoder().decode(bytes)) as MallSceneData;
  if (
    scene.schemaVersion !== 1 ||
    scene.sourceSha256 !== manifest.sourceSha256 ||
    (manifest.sourceGeometryObjects !== undefined &&
      scene.sourceGeometryObjects !== manifest.sourceGeometryObjects) ||
    !Array.isArray(scene.geometries) ||
    !Array.isArray(scene.objects) ||
    !scene.materials ||
    !scene.views ||
    !Array.isArray(scene.lights)
  ) {
    throw new Error('The procedural mall data does not match its manifest.');
  }
  if (manifest.geometryCount !== undefined && scene.geometries.length !== manifest.geometryCount) {
    throw new Error('The procedural mall geometry count does not match its manifest.');
  }
  if (manifest.objectCount !== undefined && scene.objects.length !== manifest.objectCount) {
    throw new Error('The procedural mall object count does not match its manifest.');
  }
  return scene;
}

/** One request and one parsed scene per app lifetime; Suspense shares this promise. */
export function loadMallSceneData(): Promise<MallSceneData> {
  if (!sceneDataPromise) {
    const request = fetchSceneData().catch((error: unknown) => {
      if (sceneDataPromise === request) {
        sceneDataPromise = null;
      }
      throw error;
    });
    sceneDataPromise = request;
  }
  return sceneDataPromise;
}

export function clearMallSceneDataCache(): void {
  if (sceneLoadOwners > 0 || resourceConsumers > 0) {
    return;
  }
  cacheGeneration += 1;
  nextFetchCache = 'reload';
  if (idleTimer !== null) {
    window.clearTimeout(idleTimer);
    idleTimer = null;
  }
  activeResources?.dispose();
  sceneDataPromise = null;
  sceneResourcesPromise = null;
  activeResources = null;
}

/** Parse and build the scene once; geometry payload strings are dropped after typed buffers exist. */
export function loadMallSceneResources(): Promise<MallSceneResources> {
  if (!sceneResourcesPromise) {
    const generation = cacheGeneration;
    const request = loadMallSceneData()
      .then(async (data) => {
        const resources = await createMallScene(data);
        if (generation !== cacheGeneration) {
          resources.dispose();
          throw new DOMException('The mall scene load was abandoned.', 'AbortError');
        }
        activeResources = resources;
        for (const geometry of data.geometries) {
          geometry.positions = undefined;
          geometry.normals = undefined;
          geometry.uvs = undefined;
          geometry.indices = undefined;
        }
        scheduleResourceDisposal();
        return resources;
      })
      .catch((error: unknown) => {
        if (sceneResourcesPromise === request) {
          sceneResourcesPromise = null;
        }
        if (generation === cacheGeneration) {
          sceneDataPromise = null;
        }
        throw error;
      });
    sceneResourcesPromise = request;
  }
  return sceneResourcesPromise;
}

function scheduleResourceDisposal(): void {
  if (sceneLoadOwners > 0 || resourceConsumers > 0 || idleTimer !== null) {
    return;
  }
  idleTimer = window.setTimeout(() => {
    idleTimer = null;
    if (sceneLoadOwners > 0 || resourceConsumers > 0) {
      return;
    }
    cacheGeneration += 1;
    activeResources?.dispose();
    activeResources = null;
    sceneResourcesPromise = null;
    sceneDataPromise = null;
  }, 0);
}

export function retainMallSceneLoadLease(): () => void {
  if (idleTimer !== null) {
    window.clearTimeout(idleTimer);
    idleTimer = null;
  }
  sceneLoadOwners += 1;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    sceneLoadOwners = Math.max(0, sceneLoadOwners - 1);
    scheduleResourceDisposal();
  };
}

export function retainMallSceneResources(resources: MallSceneResources): void {
  if (idleTimer !== null) {
    window.clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (activeResources === resources) {
    resourceConsumers += 1;
  }
}

export function releaseMallSceneResources(resources: MallSceneResources): void {
  if (activeResources !== resources) {
    return;
  }
  resourceConsumers = Math.max(0, resourceConsumers - 1);
  if (resourceConsumers === 0) {
    scheduleResourceDisposal();
  }
}
