import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { InstancedMesh, Mesh, MeshStandardMaterial } from 'three';
import type { PlanFloor } from '../../model/types.ts';

interface Batch {
  mesh: InstancedMesh;
  sources: Mesh[];
  visible: boolean[];
}
/** Instance identical static chair parts without changing their geometry, transforms, or picking. */
export function StaticChairBatch({ floor }: { floor: PlanFloor }) {
  const scene = useThree((state) => state.scene),
    invalidate = useThree((state) => state.invalidate);
  const batches = useRef<Batch[]>([]);
  useEffect(() => {
    if (floor.objects.length < 40) {
      return;
    }
    scene.updateMatrixWorld(true);
    const groups = new Map<string, Mesh[]>();
    for (const object of floor.objects.filter((item) => item.recipe === 'chair')) {
      scene.getObjectByName(`plan-object:${object.id}`)?.traverse((node) => {
        if (
          !(node instanceof Mesh) ||
          node instanceof InstancedMesh ||
          !(node.material instanceof MeshStandardMaterial)
        ) {
          return;
        }
        if (
          !['BoxGeometry', 'CylinderGeometry'].includes(node.geometry.type) ||
          !node.visible ||
          node.material.transparent ||
          node.material.map
        ) {
          return;
        }
        const geometry = node.geometry as typeof node.geometry & { parameters?: unknown },
          m = node.material;
        const key = JSON.stringify([
          geometry.type,
          geometry.parameters,
          m.type,
          m.color.getHex(),
          m.roughness,
          m.metalness,
          m.side,
          node.castShadow,
          node.receiveShadow,
        ]);
        const list = groups.get(key) ?? [];
        list.push(node);
        groups.set(key, list);
      });
    }
    for (const sources of groups.values()) {
      if (sources.length < 2) {
        continue;
      }
      const first = sources[0]!,
        mesh = new InstancedMesh(first.geometry, first.material, sources.length);
      mesh.name = 'WalkthroughChairBatch';
      mesh.castShadow = first.castShadow;
      mesh.receiveShadow = first.receiveShadow;
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      const visible = sources.map((source) => source.visible);
      sources.forEach((source, index) => {
        mesh.setMatrixAt(index, source.matrixWorld);
        source.visible = false;
      });
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      batches.current.push({ mesh, sources, visible });
    }
    invalidate();
    return () => {
      for (const batch of batches.current) {
        batch.sources.forEach((source, i) => {
          source.visible = batch.visible[i]!;
        });
        scene.remove(batch.mesh);
        batch.mesh.dispose();
      }
      batches.current = [];
      invalidate();
    };
  }, [floor, scene, invalidate]);
  return null;
}
