import { objectPoints } from './geometry.ts';
import { parkingLayout, type Point2 } from './parking-lot.ts';
import type { PlanObject } from './types.ts';

export type ParkingAnchorKind = 'pedestrian-exit' | 'vehicle-arrival' | 'bay-access';

/** Safe world-space anchors consumed by route picking and parking item access points. */
export function parkingAnchorPoint(
  object: PlanObject,
  kind: ParkingAnchorKind,
  bayId?: string,
): Point2 | null {
  if (object.recipe !== 'parking-lot') {
    return null;
  }
  const layout = parkingLayout(object);
  let point: Point2 | null = null;
  if (kind === 'pedestrian-exit') {
    point = layout.gates[0]?.pedestrianCenterline[1] ?? null;
  } else if (kind === 'vehicle-arrival') {
    const connectedGate = layout.gates.find((gate) => gate.isConnected);
    const pedestrianConnector = layout.walkways.length > 1 ? layout.walkways.at(-1) : null;
    // A person arriving from the car entrance uses the pedestrian connector at
    // the aisle edge, never a spawn point in the active vehicle lane.
    point =
      connectedGate && pedestrianConnector?.centerline[1]
        ? pedestrianConnector.centerline[1]
        : null;
  } else {
    const bay = layout.bays.find((candidate) => candidate.id === bayId);
    if (!bay) {
      return null;
    }
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const aisle of layout.aisles) {
      for (let index = 0; index < aisle.centerline.length - 1; index++) {
        const a = aisle.centerline[index]!,
          b = aisle.centerline[index + 1]!;
        const dx = b[0] - a[0],
          dz = b[1] - a[1];
        const t = Math.max(
          0,
          Math.min(
            1,
            ((bay.center[0] - a[0]) * dx + (bay.center[1] - a[1]) * dz) /
              Math.max(1e-8, dx * dx + dz * dz),
          ),
        );
        const candidate: Point2 = [a[0] + dx * t, a[1] + dz * t];
        const distance = Math.hypot(candidate[0] - bay.center[0], candidate[1] - bay.center[1]);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          point = candidate;
        }
      }
    }
  }
  return point ? objectPoints(object, [point])[0]! : null;
}
