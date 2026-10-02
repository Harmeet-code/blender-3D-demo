import { useGLTF } from '@react-three/drei';
import type { BufferGeometry, Material } from 'three';
import { Mesh, Texture, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

interface SharedEntry {
  scene: Object3D;
  refs: number;
  compiled?: Array<{ material: Material; geometry: BufferGeometry }>;
}
const common = new Map<string, SharedEntry>();
const floors = new Map<string, { refs: number; lastUsed: number; dispose: Set<() => void> }>();
let viewers = 0;
let shutdown: ReturnType<typeof setTimeout> | undefined;
const disposeScene = (scene: Object3D) => {
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
    if (texture.image instanceof ImageBitmap) {
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
      for (const [url, entry] of common) {
        if (entry.refs) {
          continue;
        }
        disposeScene(entry.scene);
        entry.compiled?.forEach(({ geometry }) => geometry.dispose());
        useGLTF.clear(url);
        common.delete(url);
      }
      for (const entry of floors.values()) {
        entry.dispose.forEach((dispose) => dispose());
      }
      floors.clear();
    }, 0);
  };
}
export function retainCommon(url: string, scene: Object3D) {
  const entry = common.get(url) ?? { scene, refs: 0 };
  entry.refs++;
  common.set(url, entry);
  return () => {
    entry.refs = Math.max(0, entry.refs - 1);
  };
}
/** Compiled copies belong to the common kit, never to a floor or an individual instance. */
export function compiledPrimitives(url: string, scene: Object3D) {
  const entry = common.get(url) ?? { scene, refs: 0 };
  common.set(url, entry);
  if (entry.compiled) {
    return entry.compiled;
  }
  scene.updateMatrixWorld(true);
  const byMaterial = new Map<Material, BufferGeometry[]>();
  scene.traverse((node) => {
    if (!(node instanceof Mesh)) {
      return;
    }
    if (Array.isArray(node.material)) {
      throw new Error('Batch source requires one material per primitive');
    }
    const parts = byMaterial.get(node.material) ?? [];
    parts.push(node.geometry.clone().applyMatrix4(node.matrixWorld));
    byMaterial.set(node.material, parts);
  });
  const compiled: NonNullable<SharedEntry['compiled']> = [];
  try {
    for (const [material, parts] of byMaterial) {
      const geometry = mergeGeometries(parts, false);
      if (!geometry) {
        throw new Error('Incompatible attributes in batch geometry');
      }
      geometry.computeBoundingBox();
      compiled.push({ material, geometry });
    }
    entry.compiled = compiled;
    return compiled;
  } catch (error) {
    compiled.forEach((part) => part.geometry.dispose());
    throw error;
  } finally {
    byMaterial.forEach((parts) => parts.forEach((part) => part.dispose()));
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
    commonEntries: common.size,
    commonUsers: [...common.values()].reduce((sum, entry) => sum + entry.refs, 0),
    floorSets: [...floors].map(([id, entry]) => ({ id, users: entry.refs })),
  };
}
