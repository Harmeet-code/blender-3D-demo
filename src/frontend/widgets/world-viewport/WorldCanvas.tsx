import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { LightingRig } from './LightingRig.tsx';
import { FloorStack } from './FloorStack.tsx';
import { AvatarController } from './AvatarController.tsx';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';
import { useAssetStatus } from '../../entities/asset/model/asset-status.ts';
import { retryAssetLoads } from '../../entities/asset/ui/AssetInstance.tsx';
import { AssetDiagnostics, AssetDiagnosticsPanel } from './AssetDiagnostics.tsx';

export function WorldCanvas() {
  const lowQuality = useWorldStore((s) => s.lowQuality);
  const currentFloorId = useWorldStore((s) => s.currentFloorId);
  const dollhouse = useWorldStore((s) => s.dollhouse);
  const statuses = useAssetStatus((s) => s.statuses);
  const proof = useWorldStore((s) => s.assetProof);
  return (
    <div className="h-full w-full">
      <Canvas
        shadows={!lowQuality}
        dpr={lowQuality ? 1 : [1, 1.5]}
        camera={{ position: [12, 10, 16], fov: 50 }}
      >
        <color attach="background" args={['#0f1b25']} />
        <LightingRig lowQuality={lowQuality} />
        <Physics gravity={[0, -9.81, 0]}>
          <FloorStack />
          {!dollhouse && <AvatarController key={currentFloorId} />}
        </Physics>
        <OrbitControls makeDefault />
        {proof && <AssetDiagnostics />}
      </Canvas>
      {proof && <AssetDiagnosticsPanel />}
      {Object.keys(statuses).length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="absolute top-16 left-3 max-w-sm rounded-lg bg-slate-950/90 p-3 text-xs"
        >
          {Object.entries(statuses).map(([id, status]) => (
            <p key={id}>{status.message}</p>
          ))}
          {Object.values(statuses).some((s) => s.kind === 'error') && (
            <button
              type="button"
              onClick={retryAssetLoads}
              className="mt-2 rounded bg-sky-400 px-3 py-1 text-black"
            >
              Retry assets
            </button>
          )}
        </div>
      )}
    </div>
  );
}
