import { Mesh, Texture, type Object3D, type BufferGeometry, type Material } from 'three';
/** The import form parses only to measure bounds; those private resources are never mounted. */
export function disposeMeasuredImport(scenes: readonly Object3D[]) {
  const geometries = new Set<BufferGeometry>(),
    materials = new Set<Material>(),
    textures = new Set<Texture>();
  for (const scene of scenes) {
    scene.traverse((node) => {
      if (!(node instanceof Mesh)) {
        return;
      }
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        materials.add(material);
      }
    });
  }
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof Texture) {
        textures.add(value);
      }
    }
  }
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => {
    texture.dispose();
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) {
      texture.image.close();
    }
  });
}
