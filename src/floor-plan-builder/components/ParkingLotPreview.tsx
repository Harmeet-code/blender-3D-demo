import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createObject } from '../model/inventory.ts';
import { computeParkingLayout } from '../model/parking-lot.ts';
import { parkingDesignSchema, type ParkingDesign } from '../model/parking-schema.ts';
import type { PlanObject } from '../model/types.ts';
import { ParkingLotObject } from './ParkingLotObject.tsx';

type Shape = 'rectangle' | 'l-shaped' | 'trapezoid';

const shapePoints: Record<Shape, [number, number][]> = {
  rectangle: [
    [-18, -14],
    [18, -14],
    [18, 14],
    [-18, 14],
  ],
  'l-shaped': [
    [-18, -14],
    [18, -14],
    [18, 0],
    [3, 0],
    [3, 14],
    [-18, 14],
  ],
  trapezoid: [
    [-18, -14],
    [18, -14],
    [13, 14],
    [-13, 14],
  ],
};

function CameraPreset({ top }: { top: boolean }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    if (top) {
      camera.position.set(0, 48, 0.01);
    } else {
      camera.position.set(-30, 24, -34);
    }
    camera.lookAt(0, 0, 0);
    if (controls && 'target' in controls) {
      const control = controls as unknown as {
        target: { set: (x: number, y: number, z: number) => void };
        update: () => void;
      };
      control.target.set(0, 0, 0);
      control.update();
    }
  }, [camera, controls, top]);
  return null;
}

export default function ParkingLotPreview() {
  const [shape, setShape] = useState<Shape>('rectangle');
  const [top, setTop] = useState(true);
  const [heatmap, setHeatmap] = useState(false);
  const [selectedBay, setSelectedBay] = useState<string | null>(null);
  const [design, setDesign] = useState(() => parkingDesignSchema.parse({ occupancy: 0.35 }));
  const object = useMemo(() => {
    const created = createObject('parking-lot', [0, 0]);
    return { ...created, polygon: shapePoints[shape], parkingDesign: design };
  }, [shape, design]);
  const layout = useMemo(() => computeParkingLayout(object.polygon, design), [object, design]);
  const selected = layout.bays.find((bay) => bay.id === selectedBay);
  const update = (value: Partial<ParkingDesign>) =>
    setDesign((current) => parkingDesignSchema.parse({ ...current, ...value }));
  return (
    <main className="fp-studio" data-testid="parking-lot-preview">
      <header className="fp-header fp-header-compact">
        <div className="fp-brand">
          <div>
            <h1>Parking lot preview</h1>
            <p>Procedural layout, occupancy, and bay selection</p>
          </div>
        </div>
        <div className="fp-header-actions">
          <Button size="sm" variant={top ? 'secondary' : 'outline'} onClick={() => setTop(true)}>
            Top
          </Button>
          <Button size="sm" variant={!top ? 'secondary' : 'outline'} onClick={() => setTop(false)}>
            Perspective
          </Button>
          <Button
            size="sm"
            variant={heatmap ? 'secondary' : 'outline'}
            aria-pressed={heatmap}
            onClick={() => setHeatmap((current) => !current)}
          >
            Occupancy heatmap
          </Button>
        </div>
      </header>
      <div className="fp-workspace">
        <aside className="fp-library">
          <h2>Layout</h2>
          <label className="fp-field">
            <span>Footprint</span>
            <select
              aria-label="Preview footprint"
              value={shape}
              onChange={(event) => setShape(event.target.value as Shape)}
            >
              <option value="rectangle">36 × 28 rectangle</option>
              <option value="l-shaped">Concave L shape</option>
              <option value="trapezoid">Trapezoid</option>
            </select>
          </label>
          <label className="fp-field">
            <span>Bay angle</span>
            <select
              aria-label="Preview bay angle"
              value={design.bayAngle}
              onChange={(event) =>
                update({ bayAngle: event.target.value as ParkingDesign['bayAngle'] })
              }
            >
              <option value="90">90°</option>
              <option value="60">60°</option>
              <option value="45">45°</option>
              <option value="parallel">Parallel</option>
            </select>
          </label>
          <label className="fp-field">
            <span>Aisles</span>
            <select
              aria-label="Preview aisle direction"
              value={design.oneWay ? 'one-way' : 'two-way'}
              onChange={(event) => update({ oneWay: event.target.value === 'one-way' })}
            >
              <option value="two-way">Two-way</option>
              <option value="one-way">One-way</option>
            </select>
          </label>
          <label className="fp-field">
            <span>Occupancy</span>
            <Input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={design.occupancy}
              onChange={(event) => update({ occupancy: Number(event.target.value) })}
            />
          </label>
          <label className="fp-field">
            <span>Seed</span>
            <Input
              aria-label="Preview seed"
              type="number"
              min={1}
              max={9999}
              value={design.seed}
              onChange={(event) =>
                update({ seed: Math.max(1, Math.min(9999, Number(event.target.value) || 1)) })
              }
            />
          </label>
          <p className="fp-muted">
            {layout.capacity} bays ·{' '}
            {layout.validationIssues.length
              ? layout.validationIssues.join(' ')
              : 'Gates and pedestrian paths fit the authored footprint.'}
          </p>
          {selected && (
            <p className="fp-muted">
              Selected {selected.id} · {selected.type} ·{' '}
              {selected.isOccupied ? 'occupied' : 'available'}
            </p>
          )}
        </aside>
        <section className="fp-scene-column">
          <div className="fp-viewport-wrap" style={{ flex: 1, minHeight: 0 }}>
            <Canvas shadows camera={{ position: top ? [0, 48, 0.01] : [-30, 24, -34], fov: 42 }}>
              <color attach="background" args={['#d9e0e2']} />
              <ambientLight intensity={1.1} />
              <directionalLight position={[12, 30, 8]} intensity={2.2} castShadow />
              <Suspense fallback={null}>
                <Environment preset="city" />
              </Suspense>
              <ParkingLotObject
                object={object as PlanObject}
                ghost={false}
                opacity={1}
                heatmap={heatmap}
                onSelectParkingBay={setSelectedBay}
                onSelectParkingBoundary={() => setSelectedBay(null)}
              />
              <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} />
              <CameraPreset top={top} />
            </Canvas>
          </div>
        </section>
      </div>
    </main>
  );
}
