import { useLayoutStore } from './layout-store.ts';
import { useWorldStore } from '../../viewer/model/viewer-store.ts';
import { assetProofLayout } from './asset-proof-layout.ts';
import { assetStressLayout } from './asset-stress-layout.ts';
export function useActiveLayout() {
  const source = useLayoutStore((s) => s.layout);
  const proof = useWorldStore((s) => s.assetProof),
    stress = useWorldStore((s) => s.stressPreview);
  return stress ? assetStressLayout : proof ? assetProofLayout : source;
}
