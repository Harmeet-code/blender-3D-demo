import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PlanDocument } from '../../model/types.ts';
import type { WalkableZone } from '../model/zone-schema.ts';
import { usePlaybackStore } from '../store/playback-store.ts';
import { FIXED_TIER, QUALITY, usePolishStore } from '../store/polish-store.ts';
import { LightingPresets } from './LightingPresets.tsx';
import { SceneRendering } from './SceneRendering.tsx';
import { ArrivalEffect } from './ArrivalEffect.tsx';
import { EveningGlow } from './EveningGlow.tsx';
import { StaticChairBatch } from './StaticChairBatch.tsx';

const WalkthroughSensors = lazy(() =>
  import('./WalkthroughSensors.tsx').then((module) => ({ default: module.WalkthroughSensors })),
);

/** Mount only during walkthrough: editor retains its lighting, renderer and demand loop. */
export function GameScene({
  document,
  floorId,
  originY = 0,
  zones: givenZones,
  batchingEnabled = true,
}: {
  document: PlanDocument;
  floorId: string;
  originY?: number;
  zones?: WalkableZone[];
  batchingEnabled?: boolean;
}) {
  const session = usePlaybackStore((state) => state.session),
    status = usePlaybackStore((state) => state.status);
  const tier = FIXED_TIER,
    lighting = usePolishStore((state) => state.lighting),
    minimap = usePolishStore((state) => state.minimap);
  const { gl, setDpr, get, invalidate } = useThree();
  const counters = useMemo(() => ({ renderMs: 0, npcs: 0 }), []),
    timing = useRef({ elapsed: 0, total: 0, render: 0, count: 0 });
  const floor = document.floors.find((item) => item.source.id === floorId) ?? document.floors[0]!;
  useEffect(() => {
    timing.current = { elapsed: 0, total: 0, render: 0, count: 0 };
    usePolishStore.setState({ metrics: null });
  }, [minimap]);
  const zones = useMemo<WalkableZone[]>(
    () =>
      givenZones ??
      document.floors.flatMap((f) =>
        f.zones
          .filter((z) => z.type === 'walkable')
          .map((z) => ({
            id: z.id,
            floorId: f.source.id,
            name: z.label,
            type: 'general' as const,
            polygon: z.polygon,
            holes: [],
            revision: 0,
          })),
      ),
    [givenZones, document],
  );
  useEffect(() => {
    const old = get().viewport.dpr;
    let media: MediaQueryList;
    const update = () => {
      media?.removeEventListener('change', update);
      setDpr(Math.min(window.devicePixelRatio, QUALITY[tier].dpr));
      invalidate();
      media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      media.addEventListener('change', update);
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      media.removeEventListener('change', update);
      setDpr(old);
    };
  }, [tier, get, setDpr, invalidate]);
  useEffect(() => {
    const old = gl.info.autoReset;
    const shadowUpdate = gl.shadowMap.autoUpdate;
    gl.info.autoReset = false;
    // Environment captures must not trigger repeated shadow updates.
    gl.shadowMap.autoUpdate = false;
    usePolishStore.setState({ metrics: null, notice: '' });
    return () => {
      gl.info.autoReset = old;
      gl.shadowMap.autoUpdate = shadowUpdate;
      gl.shadowMap.needsUpdate = true;
      gl.info.reset();
    };
  }, [gl]);
  useFrame((_, dt) => {
    if (window.document.hidden) {
      return;
    }
    if (status !== 'playing') {
      // Demand-loop pauses are idle time, not slow animation frames.
      timing.current = { elapsed: 0, total: 0, render: 0, count: 0 };
      gl.info.reset();
      gl.shadowMap.needsUpdate = true;
      return;
    }
    const t = timing.current;
    t.elapsed += dt;
    t.total += dt * 1000;
    t.render += counters.renderMs;
    t.count++;
    if (t.elapsed >= 1) {
      usePolishStore.getState().measure({
        frameMs: t.total / Math.max(1, t.count),
        renderMs: t.render / Math.max(1, t.count),
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        passes: 0,
        npcs: 0,
        tier,
      });
      t.elapsed = 0;
      t.total = 0;
      t.render = 0;
      t.count = 0;
    }
    gl.info.reset();
    gl.shadowMap.needsUpdate = true;
  }, -10);
  if (!session) {
    return null;
  }
  return (
    <>
      <LightingPresets
        floor={floor}
        baseY={floor.source.heightOffset + originY}
        lighting={lighting}
        tier={tier}
      />
      <EveningGlow lighting={lighting} tier={tier} revision={floor} />
      {batchingEnabled && <StaticChairBatch floor={floor} />}
      <SceneRendering counters={counters} />
      <ArrivalEffect
        runtime={session.runtime}
        originY={originY}
        count={48}
      />
      <Suspense fallback={null}>
        <WalkthroughSensors
          document={document}
          floorId={floorId}
          originY={originY}
          runtime={session.runtime}
          zones={zones}
        />
      </Suspense>
    </>
  );
}
