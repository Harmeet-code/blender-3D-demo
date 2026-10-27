import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { type Group, type Material, Mesh } from 'three';

/** Own temporary material clones. No mutation of document data or shared originals. */
export function GhostController({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const root = useRef<Group>(null);
  const invalidate = useThree((state) => state.invalidate);
  const copies = useMemo(
    () => new Map<Mesh, { original: Material | Material[]; clones: Material[]; shadow: boolean }>(),
    [],
  );
  const seen = useMemo(() => new Set<Mesh>(), []);
  useLayoutEffect(() => {
    invalidate();
    return () => {
      copies.forEach((entry, mesh) => {
        mesh.material = entry.original;
        mesh.castShadow = entry.shadow;
        entry.clones.forEach((material) => material.dispose());
      });
      copies.clear();
      invalidate();
    };
  }, [copies, enabled, invalidate]);
  useFrame(() => {
    if (!enabled || !root.current) {
      return;
    }
    seen.clear();
    let changed = false;
    root.current.traverse((node) => {
      if (!(node instanceof Mesh) || !node.userData.routeOccluder) {
        return;
      }
      seen.add(node);
      const previous = copies.get(node);
      if (
        previous &&
        (Array.isArray(node.material)
          ? node.material === previous.clones
          : node.material === previous.clones[0])
      ) {
        return;
      }
      // React/LOD may replace a material while the route remains active.
      previous?.clones.forEach((material) => material.dispose());
      const original = node.material;
      const clones = (Array.isArray(original) ? original : [original]).map((material) => {
        const clone = material.clone();
        clone.transparent = true;
        clone.opacity = Math.min(material.opacity, 0.1);
        clone.depthWrite = false;
        return clone;
      });
      copies.set(node, { original, clones, shadow: previous?.shadow ?? node.castShadow });
      node.material = Array.isArray(original) ? clones : clones[0]!;
      node.castShadow = false;
      changed = true;
    });
    copies.forEach((entry, mesh) => {
      if (seen.has(mesh)) {
        return;
      }
      mesh.material = entry.original;
      mesh.castShadow = entry.shadow;
      entry.clones.forEach((material) => material.dispose());
      copies.delete(mesh);
      changed = true;
    });
    if (changed) {
      invalidate();
    }
  });
  return <group ref={root}>{children}</group>;
}
