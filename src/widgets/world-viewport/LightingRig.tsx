import { Environment, SoftShadows } from '@react-three/drei';

/** Baked-HDRI style lighting rig. Swap to lightmaps for baked-AO perf path. */
export function LightingRig() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[10, 14, 6]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <Environment preset="city" />
      <SoftShadows />
    </>
  );
}
