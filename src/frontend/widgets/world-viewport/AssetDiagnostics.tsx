import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box3, Mesh } from 'three';
import { create } from 'zustand';
import { resolveAsset } from '../../entities/asset/model/catalog.ts';
interface ProbeAsset {
  id: string;
  boothId?: string;
  minimumY: number;
  dimensions: number[];
  resources: string[];
}
interface Probe {
  calls: number;
  triangles: number;
  assets: ProbeAsset[];
}
export const useAssetDiagnostics = create<{ probe: Probe | null }>(() => ({ probe: null }));
export function AssetDiagnostics() {
  const elapsed = useRef(0);
  useFrame(({ scene, gl }, delta) => {
    elapsed.current += delta;
    if (elapsed.current < 1) {
      return;
    }
    elapsed.current = 0;
    const assets: ProbeAsset[] = [];
    scene.updateMatrixWorld(true);
    scene.traverse((node) => {
      if (typeof node.userData.assetId !== 'string') {
        return;
      }
      const root = node.getObjectByName('root');
      if (!root) {
        return;
      }
      const bounds = new Box3().setFromObject(root),
        resources: string[] = [];
      if (bounds.isEmpty()) {
        return;
      }
      root.traverse((child) => {
        if (child instanceof Mesh) {
          resources.push(child.geometry.uuid);
        }
      });
      assets.push({
        id: node.userData.assetId,
        boothId: typeof node.userData.boothId === 'string' ? node.userData.boothId : undefined,
        minimumY: bounds.min.y,
        dimensions: [
          bounds.max.x - bounds.min.x,
          bounds.max.y - bounds.min.y,
          bounds.max.z - bounds.min.z,
        ],
        resources,
      });
    });
    useAssetDiagnostics.setState({
      probe: { calls: gl.info.render.calls, triangles: gl.info.render.triangles, assets },
    });
  });
  return null;
}
export function AssetDiagnosticsPanel() {
  const probe = useAssetDiagnostics((s) => s.probe);
  if (!probe) {
    return null;
  }
  const failures = probe.assets.filter((asset) => {
    const entry = resolveAsset(asset.id);
    return (
      entry.isOk() &&
      asset.dimensions.some(
        (n, i) => Math.abs(n - (entry.value.metadata.dimensions[i] ?? n)) > 0.01,
      )
    );
  });
  return (
    <details className="absolute top-28 right-3 max-h-72 max-w-xs overflow-auto rounded-lg bg-black/80 p-3 text-xs">
      <summary>Asset diagnostics · {probe.assets.length} instances</summary>
      <p>
        {probe.calls} render calls · {probe.triangles} triangles · {failures.length} dimension
        mismatches
      </p>
      <pre data-testid="asset-diagnostics" className="mt-2 whitespace-pre-wrap text-[10px]">
        {JSON.stringify(probe, null, 2)}
      </pre>
    </details>
  );
}
