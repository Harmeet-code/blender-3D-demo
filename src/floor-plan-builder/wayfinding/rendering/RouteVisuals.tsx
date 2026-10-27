import { useMemo } from 'react';
import type { PlanDocument } from '../../model/types.ts';
import type { RouteResult } from '../model/route-schema.ts';
import { RouteRibbon, type RibbonPath } from './RouteRibbon.tsx';
import { RouteMarkers } from './RouteMarkers.tsx';
import { usePlaybackStore } from '../store/playback-store.ts';

/** The studio displays its selected floor at local Y=0; route data retains absolute elevation. */
export function RouteVisuals({
  route,
  document,
  floorId,
  topDown = false,
  animated = true,
  progress = 0,
  showRouteLabels = true,
}: {
  route: RouteResult | null;
  document: PlanDocument;
  floorId: string;
  topDown?: boolean;
  animated?: boolean;
  progress?: number;
  showRouteLabels?: boolean;
}) {
  const runtime = usePlaybackStore((state) => state.session?.runtime ?? null);
  const rows = useMemo(() => {
    if (!route) {
      return [];
    }
    const origin =
      document.floors.find((floor) => floor.source.id === floorId)?.source.heightOffset ?? 0;
    let offset = 0;
    return route.segments.flatMap((segment, index) => {
      const startDistance = offset;
      offset += segment.lengthM;
      if (segment.toFloorId) {
        return [];
      }
      const y = (segment.points[0]?.[1] ?? 0) - origin + 0.025;
      const previous = route.segments[index - 1],
        next = route.segments[index + 1];
      const current = segment.floorId === floorId;
      const points = segment.points.map(([x, , z]): [number, number] => [x, z]);
      const first = points[0]!,
        last = points.at(-1)!;
      const badges: {
        at: [number, number, number];
        floorName: string;
        continues: boolean;
        kind?: string;
      }[] = [];
      const floorName = (id: string) =>
        document.floors.find((floor) => floor.source.id === id)?.source.name ?? id;
      if (current && next?.toFloorId) {
        badges.push({
          at: [last[0], y, last[1]],
          floorName: floorName(next.toFloorId),
          continues: true,
          kind: next.kind,
        });
      }
      if (current && previous?.toFloorId) {
        badges.push({
          at: [first[0], y, first[1]],
          floorName: `From ${floorName(previous.floorId)}`,
          continues: false,
          kind: previous.kind,
        });
      }
      const path: RibbonPath = {
        key: `${segment.floorId}-${index}`,
        points,
        y,
        faint: !current,
        startDistance,
        routeLength: route.lengthM,
        color: route.option === 'accessible' ? '#10B981' : '#1688EB',
      };
      return [
        {
          path,
          current,
          index,
          badges,
          start: current && index === 0 ? first : null,
          dest:
            current && index === route.segments.length - 1
              ? { point: last, label: route.instructions.at(-1) ?? 'Destination' }
              : null,
        },
      ];
    });
  }, [route, document, floorId]);
  const paths = useMemo(() => rows.map((row) => row.path), [rows]);
  return (
    <group name="WayfindingRoute">
      <RouteRibbon
        paths={paths}
        flow={animated}
        progress={progress}
        progressSource={runtime?.ribbon}
        topDown={topDown}
      />
      {rows
        .filter((row) => row.current)
        .map((row) => (
          <RouteMarkers
            key={row.path.key}
            points={row.path.points}
            y={row.path.y}
            startDistance={row.path.startDistance}
            start={row.start}
            dest={row.dest}
            floorBadges={row.badges}
            beaconAnimated={animated}
            topDown={topDown}
            showLabels={showRouteLabels}
          />
        ))}
    </group>
  );
}
