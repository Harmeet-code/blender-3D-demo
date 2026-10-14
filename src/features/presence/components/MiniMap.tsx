import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorldStore } from '@/features/viewer/model/viewer-store.ts';
import { useActiveLayout } from '@/features/building/model/active-layout.ts';
import { polygonBounds } from '@/utils/geometry/polygon.ts';
import { useMemo } from 'react';
import { useRoutePlanner } from '@/features/navigation/model/route-planner.ts';
import { getNavigationDestinations } from '@/features/navigation/model/navigation-destinations.ts';

/** Top-down radar synced to avatar position. */
export function MiniMap() {
  const localAvatar = useWorldStore((s) => s.localAvatar);
  const [x, , z] = localAvatar.position;
  const layout = useActiveLayout();
  const plan = useRoutePlanner((state) => state.plan);
  const floor = layout.floors.find((f) => f.id === localAvatar.floorId);
  const boundary = floor?.authoring?.boundary;
  const amenities = useMemo(
    () =>
      getNavigationDestinations(layout).filter(
        (item) => item.floorId === localAvatar.floorId && item.amenity,
      ),
    [layout, localAvatar.floorId],
  );
  const bounds = useMemo(
    () =>
      boundary ? polygonBounds(boundary) : { minX: -12.5, maxX: 12.5, minZ: -12.5, maxZ: 12.5 },
    [boundary],
  );
  const width = Math.max(0.001, bounds.maxX - bounds.minX);
  const depth = Math.max(0.001, bounds.maxZ - bounds.minZ);
  const left = (100 * (x - bounds.minX)) / width,
    top = (100 * (z - bounds.minZ)) / depth;
  const preview = useMemo(() => {
    if (!plan || plan.layout !== layout) {
      return null;
    }
    const segments: string[] = [];
    const points: Array<[number, number]> = [];
    let started = false;
    for (let i = 0; i < plan.route.points.length; i++) {
      if (plan.route.floors[i] !== localAvatar.floorId) {
        started = false;
        continue;
      }
      const point = plan.route.points[i]!;
      const x = (100 * (point[0] - bounds.minX)) / width;
      const y = (100 * (point[2] - bounds.minZ)) / depth;
      segments.push(`${started ? 'L' : 'M'}${x.toFixed(3)},${y.toFixed(3)}`);
      started = true;
      points.push([x, y]);
    }
    return points.length
      ? { path: segments.join(' '), first: points[0], last: points.at(-1) }
      : null;
  }, [plan, layout, localAvatar.floorId, bounds, width, depth]);
  return (
    <Card className="absolute right-3 bottom-3 w-32 gap-2 rounded-xl border bg-background/80 py-3 shadow-lg ring-1 ring-white/10 backdrop-blur-md sm:w-36">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-xs">Mini-map</CardTitle>
          <CardDescription className="text-[10px]">
            {preview ? 'Route preview' : 'Top-down radar'}
          </CardDescription>
        </div>
        <Badge variant="secondary" className="max-w-16 truncate" title={localAvatar.floorId}>
          {floor?.name ?? localAvatar.floorId}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="relative h-20 w-full overflow-hidden rounded-lg border bg-muted/60 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:12px_12px]">
          <svg
            aria-label="Floor boundary and amenities"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            {boundary && (
              <polygon
                points={boundary
                  .map(
                    ([x, z]) =>
                      `${(100 * (x - bounds.minX)) / width},${(100 * (z - bounds.minZ)) / depth}`,
                  )
                  .join(' ')}
                fill="none"
                stroke="currentColor"
                strokeOpacity=".4"
                strokeWidth="1"
              />
            )}
            {floor?.authoring?.walls?.map((wall) => (
              <line
                key={wall.id}
                x1={(100 * (wall.start[0] - bounds.minX)) / width}
                y1={(100 * (wall.start[1] - bounds.minZ)) / depth}
                x2={(100 * (wall.end[0] - bounds.minX)) / width}
                y2={(100 * (wall.end[1] - bounds.minZ)) / depth}
                stroke="currentColor"
                strokeOpacity=".5"
                strokeWidth="1"
              />
            ))}
            {amenities.map((item) => (
              <circle
                key={item.id}
                cx={(100 * (item.position[0] - bounds.minX)) / width}
                cy={(100 * (item.position[2] - bounds.minZ)) / depth}
                r="2"
                fill={
                  item.amenity === 'exit'
                    ? '#22c55e'
                    : item.amenity === 'washroom'
                      ? '#38bdf8'
                      : item.amenity === 'food' || item.amenity === 'coffee'
                        ? '#fb923c'
                        : item.amenity === 'information'
                          ? '#a78bfa'
                          : item.amenity === 'atm'
                            ? '#facc15'
                            : item.amenity === 'elevator'
                              ? '#34d399'
                              : '#f59e0b'
                }
              >
                <title>
                  {item.label} · {item.category}
                </title>
              </circle>
            ))}
          </svg>
          {preview && (
            <svg
              aria-label={`Route preview on ${localAvatar.floorId}`}
              role="img"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <path
                d={preview.path}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              {preview.first && (
                <circle cx={preview.first[0]} cy={preview.first[1]} r={2.3} fill="#38bdf8" />
              )}
              {preview.last && (
                <circle cx={preview.last[0]} cy={preview.last[1]} r={2.3} fill="#fbbf24" />
              )}
            </svg>
          )}
          <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-muted-foreground">
            N
          </span>
          <div
            className="pointer-events-none absolute size-10"
            aria-label="Your position and heading"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              transform: `translate(-50%, -50%) rotate(${(-localAvatar.rotationY * 180) / Math.PI}deg)`,
            }}
          >
            <svg viewBox="0 0 40 40" className="absolute inset-0 size-full">
              <path d="M20 20 L7 38 Q20 44 33 38 Z" fill="#3b82f6" opacity=".25" />
            </svg>
            <span className="absolute top-1/2 left-1/2 size-2 -translate-1/2 rounded-full border border-white bg-blue-500 ring-2 ring-blue-500/30" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
