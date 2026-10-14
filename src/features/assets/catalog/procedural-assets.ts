import { Box3, Mesh, Texture, type Group, type Material, type BufferGeometry } from 'three';
import rawCatalog from '@/assets/metadata/catalog.v1.json';
import rawBooths from '@/assets/metadata/booth-sizes.v1.json';
import { assetCatalogSchema, type AssetMetadata } from '@/features/assets/model/asset-schema.ts';
import { Recipe, type Point3 } from './recipe-tools.ts';
import { buildBaseRecipe } from './base-recipes.ts';
import { buildExpansionRecipe } from './expansion-recipes.ts';
import { expansionAssetMetadata } from '../model/expansion-metadata.ts';
import { buildSizedBooth } from './sized-booths.ts';

export type ProceduralAssetMetadata = Omit<AssetMetadata, 'id'> & {
  id: string;
  dimensionsFeet?: [number, number];
};
export interface ProceduralAsset {
  id: string;
  quality: 'baseline' | 'low' | 'opaque';
  scene: Group;
  metadata: ProceduralAssetMetadata;
  /** Called only by the final cache owner, never by one scene clone. */
  dispose(): void;
}
const catalog = assetCatalogSchema.parse(rawCatalog);
const interfaceMeshes = new Set([
  'mesh_branding',
  'branding_surface',
  'branding_default_0',
  'branding_default_1',
  'branding_default_2',
  'door_left',
  'door_right',
]);

export function getProceduralAssetIds(): readonly string[] {
  return [
    ...catalog.map((item) => item.id),
    ...rawBooths.map((item) => item.id),
    ...expansionAssetMetadata.map((item) => item.id),
  ];
}

/** Fresh deterministic owner. Cache/refcounts belong to the caller, so ownership cannot be hidden. */
export function createProceduralAsset(id: string, lowQuality = false): ProceduralAsset | null {
  const base = catalog.find((item) => item.id === id);
  const sized = rawBooths.find((item) => item.id === id);
  const expansion = expansionAssetMetadata.find((item) => item.id === id);
  if (!base && !sized && !expansion) {
    return null;
  }
  const quality =
    lowQuality && base?.variants?.opaque
      ? 'opaque'
      : lowQuality && base?.variants?.low
        ? 'low'
        : 'baseline';
  const recipe = new Recipe(id, quality === 'low');
  let metadata: ProceduralAssetMetadata;
  if (base) {
    metadata = base;
    buildBaseRecipe(recipe, quality === 'opaque');
  } else if (expansion) {
    metadata = expansion;
    buildExpansionRecipe(recipe, quality === 'opaque');
  } else {
    const feet = sized!.dimensionsFeet as [number, number];
    const [w, d] = feet.map((n) => n * 0.3048) as [number, number];
    metadata = {
      id,
      version: 1,
      label: sized!.label,
      anchor: 'floor-contact',
      facing: '+Z',
      dimensions: [w, 2.8, d],
      dimensionsFeet: feet,
      bounds: { min: [-w / 2, 0, -d / 2], max: [w / 2, 2.8, d / 2] },
      footprint: [
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [w / 2, d / 2],
        [-w / 2, d / 2],
      ],
      requiredNodes: ['root', 'socket_entry', 'socket_branding', 'mesh_branding'],
      materialRoles: {
        finish_panel: 'surface',
        finish_branding: 'branding',
        booth_satin_bronze: 'surface',
        booth_natural_oak: 'surface',
        booth_warm_led: 'surface',
      },
      sockets: {
        socket_entry: { position: [0, 0, d / 2], rotation: [0, 0, 0] },
        socket_branding: { position: [0, 2.69, d / 2], rotation: [0, 0, 0] },
      },
      colliders: sized!.colliders.map((c) => ({
        ...c,
        halfExtents: c.halfExtents as Point3,
        position: c.position as Point3,
        rotation: [0, 0, 0],
      })),
      branding: {
        node: 'mesh_branding',
        socket: 'socket_branding',
        width: w - 0.14,
        height: 0.2,
        normal: [0, 0, 1],
        defaultNodes: [],
      },
      source: {
        blend: sized!.source,
        recipe: 'src/features/assets/catalog/sized-booths.ts',
        license: 'LicenseRef-Project-Owned',
        generatorVersion: 'r3f-1',
      },
      budget: { triangles: 100000, materials: 6, bytes: 2097152, textureSize: 1024 },
      metrics: { triangles: 0, materials: 6, bytes: 0, textureBytes: 0 },
    };
    buildSizedBooth(recipe, feet);
  }
  for (const [name, socket] of Object.entries(metadata.sockets)) {
    recipe.socket(name, socket.position, socket.rotation);
  }
  recipe.scene.userData.quality_variant = quality;
  const scene = recipe.finish(interfaceMeshes);
  const geometries = new Set<BufferGeometry>(),
    materials = new Set<Material>(),
    textures = new Set<Texture>();
  let triangles = 0,
    bytes = 0;
  scene.traverse((node) => {
    if (!(node instanceof Mesh)) {
      return;
    }
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
    }
    triangles += (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3;
  });
  for (const geometry of geometries) {
    for (const attribute of Object.values(geometry.attributes)) {
      bytes += attribute.array.byteLength;
    }
    bytes += geometry.index?.array.byteLength ?? 0;
  }
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) {
        textures.add(value);
      }
    }
  }
  const bounds = new Box3().setFromObject(scene);
  // Report generated metrics separately; archived interface bounds/colliders remain unchanged.
  scene.userData.proceduralMetrics = {
    triangles,
    bytes,
    materials: materials.size,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
  };
  let disposed = false;
  return {
    id,
    quality,
    scene,
    metadata: {
      ...metadata,
      source: {
        ...metadata.source,
        recipe: 'src/features/assets/catalog/procedural-assets.ts',
        generatorVersion: 'r3f-1',
      },
      metrics: { triangles, materials: materials.size, bytes, textureBytes: 0 },
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const geometry of geometries) {
        geometry.dispose();
      }
      for (const material of new Set([...materials, ...recipe.materials.values()])) {
        material.dispose();
      }
      for (const texture of textures) {
        texture.dispose();
      }
    },
  };
}
