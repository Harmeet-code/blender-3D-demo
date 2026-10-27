import { ArrowUp, Settings2 } from 'lucide-react';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { usePolishStore, type Lighting } from '../store/polish-store.ts';
import { usePlaybackStore } from '../store/playback-store.ts';

/** All rapidly changing HUD data is already throttled; scene settings are coarse state. */
export function GameControls({ lightingControls }: { lightingControls: boolean }) {
  const lighting = usePolishStore((state) => state.lighting);
  const minimap = usePolishStore((state) => state.minimap),
    metrics = usePolishStore((state) => state.metrics),
    notice = usePolishStore((state) => state.notice);
  const session = usePlaybackStore((state) => state.session),
    snapshot = usePlaybackStore((state) => state.snapshot);
  if (!session) {
    return null;
  }
  const { runtime } = session,
    dx = runtime.look[0] - snapshot.x,
    dz = runtime.look[2] - snapshot.z;
  const angle = (-(Math.atan2(-dx, -dz) - runtime.yaw) * 180) / Math.PI;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="flex items-center gap-2">
        <ArrowUp aria-hidden style={{ transform: `rotate(${angle}deg)` }} className="size-4" />
        {snapshot.progress === 1 ? 'Destination reached' : 'Next waypoint'} · minimap N ↑
      </span>
      <span role="status" aria-live="polite" className="truncate">
        {snapshot.progress === 1 ? 'You have arrived' : notice}
      </span>
      <details className="relative">
        <summary className="flex cursor-pointer items-center gap-1">
          <Settings2 className="size-4" />
          Scene settings
        </summary>
        <div className="absolute right-0 bottom-full mb-3 max-h-[60vh] w-64 overflow-y-auto rounded-lg border bg-background p-3 shadow-xl">
          <FieldGroup className="gap-3">
            {lightingControls && (
              <Field>
                <FieldLabel htmlFor="scene-lighting">Lighting</FieldLabel>
                <select
                  id="scene-lighting"
                  className="rounded-md border bg-background p-2"
                  value={lighting}
                  onChange={(event) =>
                    usePolishStore.getState().setLighting(event.target.value as Lighting)
                  }
                >
                  <option value="day">Day</option>
                  <option value="golden">Golden hour</option>
                  <option value="evening">Evening</option>
                </select>
              </Field>
            )}
            <Field orientation="horizontal">
              <Switch
                id="scene-minimap"
                checked={minimap}
                onCheckedChange={(value) => usePolishStore.getState().setMinimap(value)}
              />
              <FieldLabel htmlFor="scene-minimap">Minimap</FieldLabel>
            </Field>
            <p className="text-muted-foreground">
              Other visitors are hidden during navigation.
            </p>
          </FieldGroup>
          {metrics && (
            <output aria-label="Rendering statistics" className="mt-3 block text-muted-foreground">
              Frame {metrics.frameMs.toFixed(1)} ms · CPU render{' '}
              {metrics.renderMs.toFixed(1)} ms · {metrics.calls} draws ·{' '}
              {metrics.triangles.toLocaleString()} triangles · {metrics.passes} FX passes ·{' '}
              {metrics.npcs} visitors
            </output>
          )}
          {import.meta.env.DEV && (
            <p className="mt-2 text-muted-foreground">
              Profiler: {runtime.renderCommits} scene commits
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
