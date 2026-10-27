import { pointInPolygon, polygonEdges, segmentDistance } from '@/utils/geometry/polygon.ts';
import { buildFloorNavInput } from '../navigation/input-builder.ts';
import { staticBlockers, visualHeight } from '../../model/geometry.ts';
import type { PlanDocument } from '../../model/types.ts';
import {
  AuthoringSpatialIndex,
  bounds2FromPoints,
  type Bounds2,
} from '../../model/authoring-spatial-index.ts';
import type { Vec3 } from './path.ts';
type P2 = [number, number];
const CAMERA_RADIUS = 0.22;
const blockerIndices = new WeakMap<CameraBlocker[], AuthoringSpatialIndex<CameraBlocker>>();

export interface CameraBlocker {
  polygon: P2[];
  edges: [Readonly<P2>, Readonly<P2>][];
  portalId?: string;
  height: number;
}
export function cameraObstacles(document: PlanDocument, floorId: string): CameraBlocker[] {
  const floor = document.floors.find((item) => item.source.id === floorId);
  if (!floor) {
    return [];
  }
  const obstacles: CameraBlocker[] = floor.objects.flatMap((object) =>
    buildFloorNavInput(floorId, floor.boundary, [], [object], false).obstacles.map((polygon) => ({
      polygon,
      edges: polygonEdges(polygon),
      portalId: object.portalId,
      height: visualHeight(object),
    })),
  );
  obstacles.push(
    ...[
      ...staticBlockers(floor, 1.8),
      ...floor.zones.filter((zone) => zone.type === 'blocked').map((zone) => zone.polygon),
    ].map((polygon) => ({
      polygon,
      edges: polygonEdges(polygon),
      portalId: undefined,
      height: Infinity,
    })),
  );
  return obstacles;
}

function blockerIndex(polygons: CameraBlocker[]): AuthoringSpatialIndex<CameraBlocker> {
  const cached = blockerIndices.get(polygons);
  if (cached) {
    return cached;
  }
  const index = new AuthoringSpatialIndex(
    polygons.map((block) => ({ bounds: bounds2FromPoints(block.polygon), value: block })),
  );
  blockerIndices.set(polygons, index);
  return index;
}

/** Camera sphere sweep against canonical NAV polygons; never render-mesh bounding boxes. */
export function safeCamera(
  from: Vec3,
  to: Vec3,
  polygons: CameraBlocker[],
  baseY: number,
  out: Vec3,
  point: P2,
  ignorePortal?: string,
) {
  const dx = to[0] - from[0],
    dy = to[1] - from[1],
    dz = to[2] - from[2],
    length = Math.hypot(dx, dy, dz),
    steps = Math.max(1, Math.ceil(length / 0.08));
  const index = blockerIndex(polygons),
    candidates: CameraBlocker[] = [];
  let safe = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps,
      y = from[1] + dy * t;
    point[0] = from[0] + dx * t;
    point[1] = from[2] + dz * t;
    if (y >= baseY - 0.1) {
      const query: Bounds2 = {
        minX: point[0] - CAMERA_RADIUS,
        minZ: point[1] - CAMERA_RADIUS,
        maxX: point[0] + CAMERA_RADIUS,
        maxZ: point[1] + CAMERA_RADIUS,
      };
      index.query(query, candidates);
      if (
        candidates.some(
          (block) =>
            y <= baseY + block.height + CAMERA_RADIUS &&
            !(ignorePortal && block.portalId === ignorePortal) &&
            (pointInPolygon(point, block.polygon) ||
              block.edges.some(([a, b]) => segmentDistance(point, a, b) < CAMERA_RADIUS)),
        )
      ) {
        break;
      }
    }
    safe = t;
  }
  out[0] = from[0] + dx * safe;
  out[1] = Math.max(baseY + 0.12, from[1] + dy * safe);
  out[2] = from[2] + dz * safe;
}
