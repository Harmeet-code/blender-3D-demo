import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { createObject } from '../model/inventory.ts';
import { ProceduralObject } from './ProceduralObject.tsx';
import type { PlanObject } from '../model/types.ts';

/** Isolated workbench for washrooms, kids zone and avatars: no venue client. */
export default function AmenityPreview() {
  const [men, setMen] = useState<PlanObject>(() => ({
    ...createObject('washroom-men', [-7, -1]),
    company: 'HALL A',
  }));
  const [women, setWomen] = useState<PlanObject>(() => ({
    ...createObject('washroom-women', [-2.5, -1]),
    company: 'HALL A',
  }));
  const [kids, setKids] = useState<PlanObject>(() => createObject('kids-zone', [3.5, -0.5]));
  const [avatar, setAvatar] = useState<PlanObject>(() => ({
    ...createObject('avatar', [0.5, 3.2]),
    name: 'YOU ARE HERE',
    avatarPin: true,
  }));
  const [topDown, setTopDown] = useState(false);
  return (
    <main className="flex h-dvh min-h-0 flex-col bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <h1 className="text-xl font-semibold">Procedural amenities preview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Washroom blocks · soft-play zone · human avatar
          </p>
        </div>
        <a className="text-sm underline" href="/admin/floor-plan?eventId=floor-plan-studio">
          Open floor plan studio
        </a>
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-3 text-sm">
        <label>
          Avatar pose{' '}
          <select
            className="rounded border border-white/20 bg-slate-900 p-2"
            aria-label="Preview avatar pose"
            value={avatar.avatarPose}
            onChange={(event) =>
              setAvatar((object) => ({
                ...object,
                avatarPose: event.target.value as PlanObject['avatarPose'],
              }))
            }
          >
            {['idle', 'walking', 'pointing', 'sitting'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Play density{' '}
          <select
            className="rounded border border-white/20 bg-slate-900 p-2"
            aria-label="Preview play density"
            value={String(kids.kidsDensity)}
            onChange={(event) =>
              setKids((object) => ({ ...object, kidsDensity: Number(event.target.value) }))
            }
          >
            {['0.2', '0.6', '1.0'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          onClick={() => {
            const next = men.washroomOpening >= 1.8 ? 1.0 : 1.8;
            setMen((object) => ({ ...object, washroomOpening: next }));
            setWomen((object) => ({ ...object, washroomOpening: next }));
          }}
        >
          Toggle maze opening
        </Button>
        <Button
          variant="outline"
          aria-pressed={topDown}
          onClick={() => setTopDown((value) => !value)}
        >
          {topDown ? 'Isometric view' : 'Top view'}
        </Button>
      </div>
      <div className="min-h-0 flex-1" aria-label="Amenities preview">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          camera={{ position: [10, 9, 15], fov: 42, near: 0.05, far: 100 }}
        >
          <color attach="background" args={['#D8DFDD']} />
          <ambientLight intensity={0.6} />
          <directionalLight
            position={[2, 10, 6]}
            intensity={2.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-12}
            shadow-camera-right={12}
            shadow-camera-top={10}
            shadow-camera-bottom={-10}
            shadow-normalBias={0.012}
          />
          <Environment resolution={64} frames={1}>
            <color attach="background" args={['#B7C3CA']} />
            <Lightformer
              position={[0, 6, 3]}
              rotation-x={Math.PI / 2}
              scale={[10, 5, 1]}
              intensity={2}
            />
          </Environment>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.006, 0]} receiveShadow>
            <planeGeometry args={[48, 48]} />
            <meshStandardMaterial color="#C2CBC7" roughness={0.92} />
          </mesh>
          <ProceduralObject object={men} color="#F8F9FA" topDown={topDown} />
          <ProceduralObject object={women} color="#F8F9FA" topDown={topDown} />
          <ProceduralObject object={kids} color="#c4d690" topDown={topDown} />
          <ProceduralObject object={avatar} color="#9ac8d8" topDown={topDown} selected />
          <OrbitControls
            makeDefault
            target={[0, 1, 0]}
            minDistance={3}
            maxDistance={40}
            maxPolarAngle={Math.PI / 2 - 0.025}
          />
        </Canvas>
      </div>
      <footer className="border-t border-white/10 px-5 py-3 text-sm text-slate-400">
        Drag to orbit · no event data is modified
      </footer>
    </main>
  );
}
