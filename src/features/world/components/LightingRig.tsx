import { useMemo } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { Object3D } from 'three';
import { useActiveLayout } from '@/features/building/model/active-layout.ts';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { polygonBounds } from '@/utils/geometry/polygon.ts';

/** Warm late-afternoon sun and a cool studio sky, matching the Blender reference. */
export function LightingRig({
  lowQuality = false,
  shadowSize = 2048,
  framing,
  studio = false,
}: {
  lowQuality?: boolean;
  shadowSize?: number;
  framing?: { center: [number, number, number]; radius: number };
  /** Inventory's photographic setup; venue sun/sky values remain the reference setup. */
  studio?: boolean;
}) {
  const layout = useActiveLayout();
  const floorId = useWorldStore((state) => state.currentFloorId);
  const selectedId = useWorldStore((state) => state.selectedBoothId);
  const floor = layout.floors.find((item) => item.id === floorId);
  const room = layout.rooms.find((item) => item.id === selectedId && item.floorId === floorId);
  const bounds = polygonBounds(
    room?.polygon ??
      floor?.authoring?.boundary ?? [
        [-20, -15],
        [20, 15],
      ],
  );
  const x = framing?.center[0] ?? (bounds.minX + bounds.maxX) / 2;
  const z = framing?.center[2] ?? (bounds.minZ + bounds.maxZ) / 2;
  const height = framing?.center[1] ?? floor?.heightOffset ?? 0;
  const radius =
    framing?.radius ??
    Math.max(18, Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 8);
  const target = useMemo(() => {
    const object = new Object3D();
    object.position.set(x, height, z);
    return object;
  }, [x, z, height]);
  return (
    <>
      <hemisphereLight args={['#d9e3ef', '#b3a393', studio ? 1.4 : 1.15]} />
      <primitive object={target} />
      <directionalLight
        key={`${radius}:${shadowSize}`}
        color="#fff0d9"
        position={[x - radius * 0.65, height + radius * 1.3, z - radius * 0.45]}
        target={target}
        intensity={studio ? 3.2 : 1.8}
        castShadow={!lowQuality && !studio}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-radius}
        shadow-camera-right={radius}
        shadow-camera-top={radius}
        shadow-camera-bottom={-radius}
        shadow-camera-near={0.1}
        shadow-camera-far={radius * 4}
        shadow-bias={-0.06 / (radius * 4)}
        shadow-normalBias={0.04}
      />
      {studio && (
        <directionalLight
          color="#dbe7f8"
          position={[x + radius, height + radius * 0.8, z + radius]}
          target={target}
          intensity={1.4}
        />
      )}
      <Environment
        resolution={lowQuality ? 64 : 128}
        frames={1}
        environmentIntensity={studio ? 1.1 : 0.35}
      >
        {/* A complete sky matters for metal: hemisphere lights have no specular radiance.
            The capture is static and shared; it adds no scene render on each frame. */}
        <color attach="background" args={['#adb8c7']} />
        <Lightformer
          form="rect"
          intensity={2}
          color="#edf3fc"
          position={[0, 12, 0]}
          rotation-x={Math.PI / 2}
          scale={[30, 30, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.5}
          color="#ffe7c5"
          position={[-10, 6, -8]}
          rotation-y={Math.PI / 4}
          scale={[12, 8, 1]}
        />
      </Environment>
    </>
  );
}
