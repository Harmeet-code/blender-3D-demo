import { useEffect, useMemo, useRef } from 'react';
import { polygonBounds } from '@/utils/geometry/polygon.ts';
import type { PlanFloor } from '../../model/types.ts';
import type { WalkableZone } from '../model/zone-schema.ts';
import { buildFloorNavInput } from '../navigation/input-builder.ts';
import { staticBlockers } from '../../model/geometry.ts';
import { usePlaybackStore } from '../store/playback-store.ts';
import { usePolishStore } from '../store/polish-store.ts';

const EMPTY_ZONES: WalkableZone[] = [];
type Point2 = readonly [number, number];

/** DOM canvas only: cached floor/route layer, imperative 10 Hz avatar updates.
 * No WebGL context, render target, secondary scene or R3F frame callback.
 */
export function Minimap({
  floor,
  zones = EMPTY_ZONES,
  placement = 'overlay',
}: {
  floor: PlanFloor;
  zones?: WalkableZone[];
  placement?: 'overlay' | 'sidebar';
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const enabled = usePolishStore((state) => state.minimap);
  const active = usePlaybackStore((state) => !!state.session);
  const input = useMemo(
    () =>
      active && enabled
        ? buildFloorNavInput(floor.source.id, floor.boundary, zones, floor.objects, false)
        : null,
    [floor, zones, active, enabled],
  );
  useEffect(() => {
    const node = canvas.current;
    if (!node || !input || !enabled || !active) {
      return;
    }
    const context = node.getContext('2d', { alpha: false });
    const cache = window.document.createElement('canvas');
    const staticContext = cache.getContext('2d', { alpha: false });
    if (!context || !staticContext) {
      return;
    }
    const bounds = polygonBounds(floor.boundary);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    let side = 160,
      scale = 1,
      dpr = 1;
    let cachedPath: unknown;
    const xy = ([x, z]: Point2): [number, number] => [
      side / 2 + (x - cx) * scale,
      side / 2 + (z - cz) * scale,
    ];
    const polygon = (ctx: CanvasRenderingContext2D, points: readonly Point2[]) => {
      ctx.beginPath();
      points.forEach((point, i) => {
        const [x, y] = xy(point);
        if (i) {
          ctx.lineTo(x, y);
        } else {
          ctx.moveTo(x, y);
        }
      });
      ctx.closePath();
      ctx.fill();
    };
    const drawStatic = () => {
      const runtime = usePlaybackStore.getState().session?.runtime;
      cachedPath = runtime?.path;
      staticContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      staticContext.fillStyle = '#101E2C';
      staticContext.fillRect(0, 0, side, side);
      staticContext.fillStyle = '#31464D';
      polygon(staticContext, floor.boundary);
      staticContext.fillStyle = '#79908E';
      for (const shape of [...input.obstacles, ...staticBlockers(floor)]) {
        polygon(staticContext, shape);
      }
      staticContext.strokeStyle = '#37D9F4';
      staticContext.lineWidth = 2;
      for (const leg of runtime?.path.legs ?? []) {
        if (leg.floorId !== floor.source.id || leg.kind !== 'walk') {
          continue;
        }
        staticContext.beginPath();
        leg.points.forEach(([x, , z], i) => {
          const p = xy([x, z]);
          if (i) {
            staticContext.lineTo(...p);
          } else {
            staticContext.moveTo(...p);
          }
        });
        staticContext.stroke();
      }
      const last = runtime?.path.legs.at(-1);
      const destination = last?.points.at(-1);
      if (last?.floorId === floor.source.id && destination) {
        staticContext.beginPath();
        staticContext.arc(...xy([destination[0], destination[2]]), 4, 0, Math.PI * 2);
        staticContext.strokeStyle = '#FFBB53';
        staticContext.stroke();
      }
      staticContext.fillStyle = '#DDECF1';
      staticContext.font = '10px system-ui';
      staticContext.fillText('N ↑', 6, 12);
    };
    const paint = () => {
      const runtime = usePlaybackStore.getState().session?.runtime;
      if (cachedPath !== runtime?.path) {
        drawStatic();
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(cache, 0, 0);
      if (!runtime || runtime.floorId !== floor.source.id) {
        return;
      }
      const [x, y] = xy([runtime.position[0], runtime.position[2]]);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.save();
      context.translate(x, y);
      context.rotate(-runtime.yaw);
      context.fillStyle = '#FFF2A9';
      context.beginPath();
      context.moveTo(0, -7);
      context.lineTo(4, 5);
      context.lineTo(0, 3);
      context.lineTo(-4, 5);
      context.closePath();
      context.fill();
      context.restore();
    };
    const resize = () => {
      side = Math.max(1, node.clientWidth);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      scale = (side - 20) / Math.max(1, bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
      node.width = cache.width = Math.max(1, Math.round(side * dpr));
      node.height = cache.height = node.width;
      drawStatic();
      paint();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    window.addEventListener('resize', resize);
    // Playback publishes 10 Hz snapshots, plus immediate pause/seek/restart updates.
    const unsubscribe = usePlaybackStore.subscribe((state, previous) => {
      if (
        state.snapshot !== previous.snapshot ||
        state.session !== previous.session ||
        state.status !== previous.status
      ) {
        paint();
      }
    });
    resize();
    return () => {
      observer.disconnect();
      unsubscribe();
      window.removeEventListener('resize', resize);
      cache.width = cache.height = 0;
    };
  }, [floor, input, enabled, active]);
  if (!active || !enabled) {
    return null;
  }
  return (
      <figure className={placement === 'sidebar'
        ? 'pointer-events-none mx-auto w-full max-w-[180px] overflow-hidden rounded-lg border border-white/20 bg-slate-950/90 text-slate-100 shadow-lg'
        : 'pointer-events-none absolute top-3 right-3 z-20 w-[clamp(100px,20%,180px)] overflow-hidden rounded-lg border border-white/20 bg-slate-950/90 text-slate-100 shadow-lg'}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Minimap · ${floor.source.name} · north up`}
        className="block aspect-square w-full"
      />
      <figcaption className="truncate px-2 py-1 text-[10px]">{floor.source.name} · N ↑</figcaption>
    </figure>
  );
}
