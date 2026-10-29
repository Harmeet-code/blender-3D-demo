import { useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Line, OrbitControls, Text } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import type { PlanObject } from '../model/types.ts';
import { createObject } from '../model/inventory.ts';
import { applyShippingVariant, shippingProfiles, type ShippingVariant } from '../model/shipping.ts';
import { shippingSpatialLayout, shippingWorldPoint } from '../model/shipping-spatial.ts';
import { ShippingObject } from './ShippingObject.tsx';

function CameraPreset({ top }: { top: boolean }) {
  const { camera, controls, invalidate } = useThree();
  useEffect(() => {
    camera.up.set(0, 1, 0);
    const position: [number, number, number] = top ? [0, 27, 0.01] : [-12, 10, -18];
    camera.position.set(...position);
    camera.lookAt(0, 1, 0);
    if (controls && 'target' in controls) {
      (
        controls as unknown as {
          target: { set: (x: number, y: number, z: number) => void };
          update: () => void;
        }
      ).target.set(0, 1, 0);
      (controls as unknown as { update: () => void }).update();
    }
    invalidate();
  }, [camera, controls, invalidate, top]);
  return null;
}

function DockMarkers({ object }: { object: PlanObject }) {
  const layout = shippingSpatialLayout(object);
  const human = shippingWorldPoint(object, layout.pedestrianAnchor);
  const vehicle = shippingWorldPoint(object, layout.vehicleTarget);
  const humanCenter: [number, number, number] = [human[0], 1.24, human[1]];
  const vehicleCenter: [number, number, number] = [vehicle[0], 0.08, vehicle[1]];
  return (
    <>
      <Line
        points={[[0, 0.06, -3], vehicleCenter]}
        color="#F3B522"
        lineWidth={2}
        dashed
        dashSize={0.3}
        gapSize={0.15}
      />
      <mesh position={humanCenter}>
        <cylinderGeometry args={[0.28, 0.28, 0.08, 24]} />
        <meshStandardMaterial color="#22C55E" emissive="#0F6B32" />
      </mesh>
      <Text
        position={[humanCenter[0], 1.55, humanCenter[2]]}
        fontSize={0.3}
        color="#14532D"
        anchorX="center"
      >
        PEDESTRIAN ACCESS
      </Text>
      <mesh position={vehicleCenter}>
        <sphereGeometry args={[0.22, 16, 12]} />
        <meshStandardMaterial color="#F59E0B" emissive="#7C3F08" />
      </mesh>
      <Text
        position={[vehicleCenter[0], 0.45, vehicleCenter[2]]}
        fontSize={0.26}
        color="#78350F"
        anchorX="center"
      >
        VEHICLE TARGET
      </Text>
    </>
  );
}

/** Development-only visual workbench for the three shipping configurations. */
export default function ShippingPreview() {
  const [variant, setVariant] = useState<ShippingVariant>('dock-bay');
  const [top, setTop] = useState(false);
  const [object, setObject] = useState<PlanObject>(
    () => applyShippingVariant(createObject('shipping', [0, 0]), 'dock-bay') as PlanObject,
  );
  const setMode = (next: ShippingVariant) => {
    setVariant(next);
    setObject((current) => ({ ...current, ...applyShippingVariant(current, next) }));
  };
  const doorOpen = object.shippingDoorStates?.some((state) => state === 'open') ?? false;
  const toggleDoors = () =>
    setObject((current) => ({
      ...current,
      shippingDoorStates: (current.shippingDoorStates ?? []).map(() =>
        doorOpen ? 'closed' : 'open',
      ),
    }));
  const profile = shippingProfiles[variant];
  return (
    <main className="flex h-dvh min-h-0 flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h1 className="text-xl font-semibold">Shipping and receiving preview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Isolated geometry workbench · no venue data or persistence
          </p>
        </div>
        <a className="text-sm underline" href="/admin/floor-plan?eventId=floor-plan-studio">
          Open floor plan studio
        </a>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3 text-sm">
        {(['dock-bay', 'container-yard', 'staging-only'] as const).map((mode) => (
          <Button
            key={mode}
            variant={variant === mode ? 'default' : 'outline'}
            onClick={() => setMode(mode)}
          >
            {shippingProfiles[mode].label}
          </Button>
        ))}
        {variant === 'dock-bay' && (
          <>
            <Button variant="outline" onClick={toggleDoors}>
              {doorOpen ? 'Close doors' : 'Open doors'}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                setObject((current) => ({
                  ...current,
                  shippingTrailerDocked: !current.shippingTrailerDocked,
                }))
              }
            >
              {object.shippingTrailerDocked ? 'Remove trailer' : 'Dock trailer'}
            </Button>
          </>
        )}
        <Button variant="outline" aria-pressed={top} onClick={() => setTop((value) => !value)}>
          {top ? 'Perspective' : 'Top view'}
        </Button>
        <span className="text-slate-400">
          {profile.dimensions[0]} × {profile.dimensions[1]} × {profile.dimensions[2]} m
        </span>
      </div>
      <div className="min-h-0 flex-1" aria-label="Shipping geometry preview">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          camera={{ position: [-12, 10, -18], fov: 42, near: 0.05, far: 140 }}
        >
          <color attach="background" args={['#D8DFDD']} />
          <CameraPreset top={top} />
          <ambientLight intensity={0.65} />
          <directionalLight
            position={[3, 14, -5]}
            intensity={2.3}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />
          <Environment preset="warehouse" />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, -3]} receiveShadow>
            <planeGeometry args={[48, 48]} />
            <meshStandardMaterial color="#BEC6C4" roughness={0.94} />
          </mesh>
          <group rotation={[0, object.yawRadians, 0]}>
            <ShippingObject
              object={object}
              width={object.dimensions[0]}
              depth={object.dimensions[2]}
            />
            <DockMarkers object={object} />
          </group>
          <OrbitControls makeDefault target={[0, 1, 0]} maxPolarAngle={Math.PI * 0.49} />
        </Canvas>
      </div>
    </main>
  );
}
