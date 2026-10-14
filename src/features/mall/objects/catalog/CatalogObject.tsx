import { useEffect, useMemo, type ReactNode } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import { Mesh, MeshPhysicalMaterial, type ColorRepresentation, type Material } from 'three';
import {
  proceduralAssetScene,
  retainCommon,
  retainViewer,
} from '@/features/assets/model/resource-cache.ts';

export interface SurfaceOverride {
  color?: ColorRepresentation;
  roughness?: number;
  metalness?: number;
}
export type CatalogObjectProps = Omit<ThreeElements['group'], 'children' | 'dispose'> & {
  detail?: 'baseline' | 'low';
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Overrides are private to this instance; cached materials are never mutated. */
  surfaces?: Readonly<Record<string, SurfaceOverride>>;
  children?: ReactNode;
};

/** Named components reuse the existing code-authored recipes, never mall blueprint data. */
export function CatalogObject({
  assetId,
  detail = 'baseline',
  castShadow = true,
  receiveShadow = true,
  surfaces,
  children,
  ...props
}: CatalogObjectProps & { assetId: string }) {
  const url = `procedural:${assetId}@1:${detail}`;
  const source = useMemo(() => proceduralAssetScene(url), [url]);
  const owned = useMemo(() => {
    const scene = source.clone(true);
    const materialCopies = new Map<Material, Material>();
    scene.traverse((node) => {
      if (!(node instanceof Mesh)) {
        return;
      }
      const customize = (material: Material) => {
        const override = surfaces?.[material.name];
        if (!override) {
          return material;
        }
        let copy = materialCopies.get(material);
        if (!copy) {
          copy = material.clone();
          if ('color' in copy && override.color !== undefined) {
            (copy as MeshPhysicalMaterial).color.set(override.color);
          }
          if ('roughness' in copy && override.roughness !== undefined) {
            (copy as MeshPhysicalMaterial).roughness = Math.max(0, Math.min(1, override.roughness));
          }
          if ('metalness' in copy && override.metalness !== undefined) {
            (copy as MeshPhysicalMaterial).metalness = Math.max(0, Math.min(1, override.metalness));
          }
          materialCopies.set(material, copy);
        }
        return copy;
      };
      node.material = Array.isArray(node.material)
        ? node.material.map(customize)
        : customize(node.material);
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      node.castShadow =
        castShadow &&
        !materials.some(
          (material) =>
            material.transparent ||
            (material instanceof MeshPhysicalMaterial && material.transmission > 0),
        );
      node.receiveShadow = receiveShadow;
    });
    return { scene, materials: [...materialCopies.values()] };
  }, [source, castShadow, receiveShadow, surfaces]);
  useEffect(retainViewer, []);
  useEffect(() => retainCommon(url, source), [url, source]);
  useEffect(() => () => owned.materials.forEach((material) => material.dispose()), [owned]);
  return (
    <group {...props}>
      <primitive object={owned.scene} dispose={null} />
      {children}
    </group>
  );
}
