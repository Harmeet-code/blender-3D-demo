import { useLayoutStore } from '@/features/building/model/layout-store.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { assetProofLayout } from '@/features/building/model/asset-proof-layout.ts';
import { assetStressLayout } from '@/features/building/model/asset-stress-layout.ts';
export function useActiveLayout() {
  const source = useLayoutStore((s) => s.layout);
  const proof = useWorldStore((s) => s.assetProof),
    stress = useWorldStore((s) => s.stressPreview);
  return stress ? assetStressLayout : proof ? assetProofLayout : source;
}
