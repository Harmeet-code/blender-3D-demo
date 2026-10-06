import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { LightingRig } from './LightingRig.tsx';
import { FloorStack } from './FloorStack.tsx';
import { AvatarController } from './AvatarController.tsx';
import { RemoteAvatarLayer } from './RemoteAvatarLayer.tsx';
import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';
import { retainViewer } from '../../entities/asset/model/resource-cache.ts';
import { AssetDiagnostics, AssetDiagnosticsPanel } from './AssetDiagnostics.tsx';
import { AssetStatusAlert } from './AssetStatusAlert.tsx';
export function WorldCanvas() {
  const lowQuality = useWorldStore((s) => s.lowQuality),
    currentFloorId = useWorldStore((s) => s.currentFloorId),
    dollhouse = useWorldStore((s) => s.dollhouse);
  const proof = useWorldStore((s) => s.assetProof),
    stress = useWorldStore((s) => s.stressPreview);
  const diagnostics = useWorldStore((s) => s.diagnosticsEnabled) || proof || stress;
  useEffect(retainViewer, []);
  return (
    <div className="h-full w-full">
      <Canvas
        shadows={!lowQuality}
        dpr={lowQuality ? 1 : [1, 1.5]}
        camera={{ position: [24, 20, 30], fov: 50 }}
      >
        <color attach="background" args={['#0f1b25']} />
        <LightingRig lowQuality={lowQuality} />
        <Physics gravity={[0, -9.81, 0]} paused={dollhouse}>
          <FloorStack />
          {!dollhouse && <AvatarController key={currentFloorId} />}
          {!dollhouse && <RemoteAvatarLayer />}
          {diagnostics && <AssetDiagnostics />}
        </Physics>
        <OrbitControls makeDefault />
      </Canvas>
      {diagnostics && <AssetDiagnosticsPanel />}
      <AssetStatusAlert />
    </div>
  );
}
