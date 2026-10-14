import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { PerspectiveCamera, ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace } from 'three';
import { useActiveLayout } from '@/features/building/model/active-layout.ts';
import { polygonBounds } from '@/utils/geometry/polygon.ts';
import { PathLine } from './PathLine.tsx';
import type { GLProps, Renderer } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { LightingRig } from '@/features/world/components/LightingRig.tsx';
import { FloorStack } from '@/features/world/components/FloorStack.tsx';
import { AvatarController } from '@/features/world/components/AvatarController.tsx';
import { RemoteAvatarLayer } from '@/features/world/components/RemoteAvatarLayer.tsx';
import { resolveRendererBackend } from '@/features/world/components/create-renderer.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { retainViewer } from '@/features/assets/model/resource-cache.ts';
import {
  AssetDiagnostics,
  AssetDiagnosticsPanel,
  useAssetDiagnostics,
} from '@/features/world/components/AssetDiagnostics.tsx';
import { AssetStatusAlert } from '@/features/world/components/AssetStatusAlert.tsx';
import { FrameCoordinator } from './FrameCoordinator.tsx';
import { GRAPHICS, useGraphicsQuality } from '../model/graphics-quality.ts';
import { frameRuntime } from '../model/frame-runtime.ts';
import { useReducedMotion } from '../hooks/use-reduced-motion.ts';
import { ShaderPreparation } from './ShaderPreparation.tsx';
import { FollowCamera } from './FollowCamera.tsx';
import { RoutePreview } from '@/features/navigation/components/RoutePreview.tsx';
import { FloorPointInteraction } from './FloorPointInteraction.tsx';
function VenueCamera() {
  const walkMode = useWorldStore((s) => s.walkMode);
  const layout = useActiveLayout(),
    floorId = useWorldStore((s) => s.currentFloorId);
  const selectedId = useWorldStore((s) => s.selectedBoothId);
  const { camera, controls, gl } = useThree();
  const reducedMotion = useReducedMotion();
  const transition = useRef<{
    started: number;
    from: Vector3;
    to: Vector3;
    targetFrom: Vector3;
    targetTo: Vector3;
  } | null>(null);
  useEffect(() => {
    const cancel = () => {
      transition.current = null;
      frameRuntime.release('camera-command');
    };
    const unsubscribe = useAssetDiagnostics.subscribe((state, previous) => {
      if (state.tour !== previous.tour || state.focus !== previous.focus) {
        cancel();
      }
    });
    gl.domElement.addEventListener('pointerdown', cancel);
    gl.domElement.addEventListener('wheel', cancel, { passive: true });
    return () => {
      unsubscribe();
      cancel();
      gl.domElement.removeEventListener('pointerdown', cancel);
      gl.domElement.removeEventListener('wheel', cancel);
    };
  }, [gl]);
  const previousView = useRef<{
    buildingId: string;
    floorId: string;
    selectedId: string | null;
  } | null>(null);
  useFrame(() => {
    if (walkMode) {
      return;
    }
    const orbit = controls as unknown as { target: Vector3 } | null;
    const command = transition.current;
    if (command && orbit) {
      const t = Math.min(1, (performance.now() - command.started) / 350);
      const ease = t * t * (3 - 2 * t);
      camera.position.lerpVectors(command.from, command.to, ease);
      orbit.target.lerpVectors(command.targetFrom, command.targetTo, ease);
      camera.lookAt(orbit.target);
      if (t === 1) {
        transition.current = null;
        frameRuntime.release('camera-command');
      }
    }
    if (!(camera instanceof PerspectiveCamera) || !orbit) {
      return;
    }
    // Keep depth precision at campus scale, then allow close-up human-scale inspection.
    const near = Math.max(0.05, Math.min(5, camera.position.distanceTo(orbit.target) * 0.005));
    if (Math.abs(camera.near - near) > camera.near * 0.1) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  });
  useEffect(() => {
    if (walkMode) {
      transition.current = null;
      frameRuntime.release('camera-command');
      return;
    }
    const floor = layout.floors.find((item) => item.id === floorId);
    if (!floor?.authoring) {
      return;
    }
    const room = layout.rooms.find((item) => item.id === selectedId && item.floorId === floorId);
    if (
      previousView.current?.buildingId === layout.buildingId &&
      previousView.current.floorId === floorId &&
      (!room || previousView.current.selectedId === selectedId)
    ) {
      previousView.current.selectedId = selectedId;
      return;
    }
    const initial = previousView.current === null;
    previousView.current = { buildingId: layout.buildingId, floorId, selectedId };
    const b = polygonBounds(room?.polygon ?? floor.authoring.boundary),
      x = (b.minX + b.maxX) / 2,
      z = (b.minZ + b.maxZ) / 2,
      span = Math.max(room ? 7 : 1, Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * (room ? 1.7 : 1)),
      targetHeight = floor.heightOffset + (room ? 1.1 : 0);
    const destination = new Vector3(x + span * 0.65, targetHeight + span * 0.8, z + span * 0.9);
    const destinationTarget = new Vector3(x, targetHeight, z);
    if (camera instanceof PerspectiveCamera) {
      camera.near = room ? 0.1 : Math.max(0.1, span * 0.01);
      camera.far = Math.max(2000, span * 10);
      camera.updateProjectionMatrix();
    }
    const orbit = controls as unknown as { target: Vector3; update: () => void } | null;
    if (orbit && !initial && !reducedMotion) {
      transition.current = {
        started: performance.now(),
        from: camera.position.clone(),
        to: destination,
        targetFrom: orbit.target.clone(),
        targetTo: destinationTarget,
      };
      frameRuntime.wake('camera-command', 400);
    } else {
      transition.current = null;
      camera.position.copy(destination);
      camera.lookAt(destinationTarget);
      orbit?.target.copy(destinationTarget);
      frameRuntime.wake('camera-command', 50);
    }
    if (orbit && (initial || reducedMotion)) {
      orbit.update();
    }
  }, [layout, floorId, selectedId, camera, controls, reducedMotion, walkMode]);
  return null;
}
function AutopilotPath() {
  const route = useWorldStore((s) => s.autopilot);
  const points = useMemo(
    () => route?.waypoints.map(([x, y, z]): [number, number, number] => [x, y - 0.95, z]) ?? [],
    [route],
  );
  return route ? <PathLine points={points} trackAvatar /> : null;
}
export function WorldCanvas() {
  const walkMode = useWorldStore((s) => s.walkMode);
  const tier = useGraphicsQuality((s) => s.tier);
  const graphics = GRAPHICS[tier];
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
        frameloop="demand"
        shadows={!lowQuality}
        dpr={lowQuality ? 1 : Math.min(window.devicePixelRatio || 1, graphics.dpr)}
        camera={{ position: [24, 20, 30], fov: 50 }}
        gl={gl}
        onCreated={({ gl: renderer }) => {
          renderer.toneMapping = ACESFilmicToneMapping;
          renderer.toneMappingExposure = 0.8;
          renderer.outputColorSpace = SRGBColorSpace;
          renderer.shadowMap.type = PCFSoftShadowMap;
          renderer.shadowMap.autoUpdate = false;
          renderer.shadowMap.needsUpdate = true;
        }}
      >
        <color attach="background" args={['#8491a2']} />
        <ShaderPreparation />
        <LightingRig lowQuality={lowQuality} shadowSize={graphics.shadowSize} />
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} interpolate={false} paused>
          <FrameCoordinator />
          <FloorPointInteraction>
            <FloorStack />
          </FloorPointInteraction>
          {!dollhouse && <AvatarController key={currentFloorId} />}
          {!dollhouse && <FollowCamera />}
          {!dollhouse && <RemoteAvatarLayer />}
          {diagnostics && <AssetDiagnostics />}
        </Physics>
        <OrbitControls
          makeDefault
          enabled={!walkMode}
          onStart={() => frameRuntime.wake('orbit', Infinity)}
          onEnd={() => {
            frameRuntime.release('orbit');
            frameRuntime.wake('orbit-settle', 500);
          }}
        />
        <VenueCamera />
        <AutopilotPath />
        <RoutePreview />
      </Canvas>
      {diagnostics && <AssetDiagnosticsPanel />}
      {walkMode && (
        <p className="absolute bottom-3 left-3 rounded-md border bg-background/90 px-3 py-2 text-xs shadow-sm">
          WASD or arrow keys · Shift to run · Escape to orbit
        </p>
      )}
      <AssetStatusAlert />
    </div>
  );
}
