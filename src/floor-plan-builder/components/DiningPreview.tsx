import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createObject } from '../model/inventory.ts';
import { diningLayout } from '../model/dining.ts';
import type { PlanObject } from '../model/types.ts';
import { DiningObject } from './DiningObject.tsx';

function CameraPreset({ top }: { top: boolean }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    if (top) {
      camera.position.set(0, 28, 0.01);
    } else {
      camera.position.set(-15, 11, -17);
    }
    camera.lookAt(0, 0, 0);
    if (controls && 'target' in controls) {
      const orbit = controls as unknown as {
        target: { set: (x: number, y: number, z: number) => void };
        update: () => void;
      };
      orbit.target.set(0, 0, 0);
      orbit.update();
    }
  }, [camera, controls, top]);
  return null;
}

const styles: NonNullable<PlanObject['diningStyle']>[] = [
  'grid4',
  'grid6',
  'rows-banquet',
  'round6',
  'round8',
  'communal-long',
  'cafe-bistro',
];

export default function DiningPreview() {
  const [top, setTop] = useState(true);
  const [style, setStyle] = useState<NonNullable<PlanObject['diningStyle']>>('grid4');
  const [chairStyle, setChairStyle] =
    useState<NonNullable<PlanObject['diningChairStyle']>>('plastic-stackable');
  const [occupancy, setOccupancy] = useState(0.35);
  const [seed, setSeed] = useState(42);
  const object = useMemo(() => {
    const created = createObject('dining', [0, 0]);
    return {
      ...created,
      diningStyle: style,
      diningChairStyle: chairStyle,
      diningOccupancy: occupancy,
      diningSeed: seed,
      diningTableCount: 6,
      diningCenterpiece: 'vase-flowers' as const,
      diningShade: 'none' as const,
      diningBoundary: 'none' as const,
      diningHost: true,
      diningBusTub: false,
    };
  }, [style, chairStyle, occupancy, seed]);
  const layout = useMemo(() => diningLayout(object), [object]);
  return (
    <main className="fp-studio" data-testid="dining-preview">
      <header className="fp-header fp-header-compact">
        <div className="fp-brand">
          <div>
            <h1>Dining preview</h1>
            <p>Furniture scale, seating style, and occupancy</p>
          </div>
        </div>
        <div className="fp-header-actions">
          <Button size="sm" variant={top ? 'secondary' : 'outline'} onClick={() => setTop(true)}>
            Top
          </Button>
          <Button size="sm" variant={!top ? 'secondary' : 'outline'} onClick={() => setTop(false)}>
            Perspective
          </Button>
        </div>
      </header>
      <div className="fp-workspace">
        <aside className="fp-library">
          <h2>Customize</h2>
          <label className="fp-field">
            <span>Layout</span>
            <select
              aria-label="Preview dining layout"
              value={style}
              onChange={(event) =>
                setStyle(event.target.value as NonNullable<PlanObject['diningStyle']>)
              }
            >
              {styles.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('-', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="fp-field">
            <span>Chair style</span>
            <select
              aria-label="Preview chair style"
              value={chairStyle}
              onChange={(event) =>
                setChairStyle(event.target.value as NonNullable<PlanObject['diningChairStyle']>)
              }
            >
              <option value="plastic-stackable">Plastic stackable</option>
              <option value="wooden-cafe">Wooden café</option>
              <option value="bistro-wire">Bistro wire</option>
              <option value="banquet-padded">Banquet padded</option>
              <option value="bar-stool">Bar stool</option>
            </select>
          </label>
          <label className="fp-field">
            <span>Occupancy</span>
            <Input
              aria-label="Preview occupancy"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={occupancy}
              onChange={(event) => setOccupancy(Number(event.target.value))}
            />
          </label>
          <label className="fp-field">
            <span>Seed</span>
            <Input
              aria-label="Preview seed"
              type="number"
              min={1}
              max={999999}
              value={seed}
              onChange={(event) =>
                setSeed(Math.max(1, Math.min(999999, Number(event.target.value) || 1)))
              }
            />
          </label>
          <p className="fp-muted">
            {layout.capacity} seats across {layout.tables.length} fitted tables.
          </p>
          {layout.warnings.map((warning) => (
            <p className="fp-error" key={warning}>
              {warning}
            </p>
          ))}
        </aside>
        <section className="fp-scene-column">
          <div className="fp-viewport-wrap" style={{ flex: 1, minHeight: 0 }}>
            <Canvas shadows camera={{ position: top ? [0, 28, 0.01] : [-15, 11, -17], fov: 42 }}>
              <color attach="background" args={['#d9e0e2']} />
              <ambientLight intensity={1.1} />
              <directionalLight position={[12, 18, 8]} intensity={2} castShadow />
              <Suspense fallback={null}>
                <Environment preset="city" />
              </Suspense>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
                <planeGeometry args={[32, 26]} />
                <meshStandardMaterial color="#c5d0c5" />
              </mesh>
              <DiningObject object={object as PlanObject} ghost={false} opacity={1} />
              <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} />
              <CameraPreset top={top} />
            </Canvas>
          </div>
        </section>
      </div>
    </main>
  );
}
