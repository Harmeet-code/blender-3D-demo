import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { LightingRig } from './LightingRig.tsx';
import { FloorStack } from './FloorStack.tsx';
import { AvatarController } from './AvatarController.tsx';

export function WorldCanvas() {
  return (
    <div className="h-full w-full">
      <Canvas shadows camera={{ position: [12, 10, 12], fov: 50 }}>
        <LightingRig />
        <Physics gravity={[0, -9.81, 0]}>
          <FloorStack />
          <AvatarController />
        </Physics>
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}
