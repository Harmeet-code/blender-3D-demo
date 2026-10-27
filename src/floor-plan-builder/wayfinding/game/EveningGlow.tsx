import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three';
import { QUALITY, type Lighting, type Tier } from '../store/polish-store.ts';

/** Clones only luminous surfaces; shared inventory materials are never changed in place. */
export function EveningGlow({
  lighting,
  tier,
  revision,
}: {
  lighting: Lighting;
  tier: Tier;
  revision: unknown;
}) {
  const scene = useThree((state) => state.scene),
    invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const clones = new Map<Material, Material>(),
      restore: { mesh: Mesh; material: Material | Material[] }[] = [];
    scene.traverse((node) => {
      if (!(node instanceof Mesh)) {
        return;
      }
      const replace = (original: Material) => {
        const luminous =
          original instanceof MeshStandardMaterial && original.emissive.getHex() !== 0;
        const simplify =
          original instanceof MeshPhysicalMaterial &&
          original.transmission > 0 &&
          !QUALITY[tier].transmission;
        if (!luminous && !simplify) {
          return original;
        }
        let clone = clones.get(original);
        if (!clone) {
          clone = original.clone();
          if (clone instanceof MeshStandardMaterial) {
            clone.emissiveIntensity *= lighting === 'evening' ? 3 : 1;
          }
          if (simplify && clone instanceof MeshPhysicalMaterial) {
            clone.transmission = 0;
            clone.transparent = true;
            clone.opacity = Math.min(clone.opacity, 0.28);
            clone.depthWrite = false;
          }
          clones.set(original, clone);
        }
        return clone;
      };
      const original = node.material;
      const next = Array.isArray(original) ? original.map(replace) : replace(original);
      if (next !== original) {
        restore.push({ mesh: node, material: original });
        node.material = next;
      }
    });
    invalidate();
    return () => {
      for (const { mesh, material } of restore) {
        mesh.material = material;
      }
      for (const clone of clones.values()) {
        clone.dispose();
      }
      invalidate();
    };
  }, [scene, lighting, tier, revision, invalidate]);
  return null;
}
