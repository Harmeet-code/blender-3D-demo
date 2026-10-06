import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { GLProps, Renderer } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { LightingRig } from './LightingRig.tsx';
import { FloorStack } from './FloorStack.tsx';
import { AvatarController } from './AvatarController.tsx';
import { RemoteAvatarLayer } from './RemoteAvatarLayer.tsx';
import { resolveRendererBackend } from './create-renderer.ts';
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
  const [rendererFailed, setRendererFailed] = useState(false);
  const gl: GLProps = useMemo(
    () => async (defaultProps) => {
      try {
        // WebGPU stays opt-in (?webgpu=1) until the R3F render loop is proven
        // against it; WebGL2 remains the default backend.
        const webgpuEnabled =
          typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).has('webgpu');
        const resolved = await resolveRendererBackend(defaultProps.canvas, { webgpuEnabled });
        return resolved.renderer as Renderer;
      } catch {
        setRendererFailed(true);
        throw new Error('No WebGPU or WebGL renderer available');
      }
    },
    [],
  );
  useEffect(retainViewer, []);
  if (rendererFailed) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>3D unavailable</AlertTitle>
          <AlertDescription>
            This browser provided neither a WebGPU adapter nor a WebGL2 context. Reload to retry.
          </AlertDescription>
          <AlertAction>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                window.location.reload();
              }}
            >
              Reload
            </Button>
          </AlertAction>
        </Alert>
      </div>
    );
  }
  return (
    <div className="h-full w-full">
      <Canvas
        shadows={!lowQuality}
        dpr={lowQuality ? 1 : [1, 1.5]}
        camera={{ position: [24, 20, 30], fov: 50 }}
        gl={gl}
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
