import type { PlanObject } from './types.ts';
import { shippingProfiles } from './shipping.ts';

export type ShippingPoint = [number, number];
export interface ShippingBaySpatialLayout {
  /** Dock-origin coordinates. The opening is (0,0), approach is -Z and interior is +Z. */
  dockOpening: ShippingPoint;
  bayCenters: ShippingPoint[];
  /** Elevated human staging point in dock-origin XZ; the renderer places it at Y=1.2 m. */
  pedestrianAnchor: ShippingPoint;
  /** Ground-plane waypoint at the stair foot for the existing 2D XZ pathfinder. */
  pedestrianApproachAnchor: ShippingPoint;
  vehicleTarget: ShippingPoint;
  approachLane: ShippingPoint[];
  interiorLane: ShippingPoint[];
  /** Complete plan footprint including stairs and trailer, in dock-origin coordinates. */
  placementFootprints: ShippingPoint[][];
  /** Physical appendages reserved when other authored objects are placed nearby. */
  appendageFootprints: ShippingPoint[][];
  /** Ground-plane blockers consumed by the XZ navmesh; trailer walls stay hollow. */
  navigationObstacles: ShippingPoint[][];
}

/** Shared dock-opening coordinate adapter for the centered floor-plan object model. */
export function shippingSpatialLayout(object: PlanObject): ShippingBaySpatialLayout {
  const variant = object.shippingVariant ?? 'dock-bay';
  const [, , profileDepth] = shippingProfiles[variant].dimensions;
  const [width, , objectDepth] = object.dimensions;
  const depth = objectDepth || profileDepth;
  const bayCount = variant === 'dock-bay' ? (width >= 10 ? Math.floor((width - 6) / 4) + 1 : 1) : 0;
  const bayCenters = Array.from(
    { length: bayCount },
    (_, index) => [(index - (bayCount - 1) / 2) * 4, 0] as ShippingPoint,
  );
  const anchor: ShippingPoint = [Math.min(width / 2 - 0.5, 3.2), 2.5];
  const localFootprint: ShippingPoint[] = [
    [-width / 2, 0],
    [width / 2, 0],
    [width / 2, depth],
    [-width / 2, depth],
  ];
  const rectangle = (
    centerX: number,
    centerZ: number,
    rectangleWidth: number,
    rectangleDepth: number,
  ) =>
    [
      [centerX - rectangleWidth / 2, centerZ - rectangleDepth / 2],
      [centerX + rectangleWidth / 2, centerZ - rectangleDepth / 2],
      [centerX + rectangleWidth / 2, centerZ + rectangleDepth / 2],
      [centerX - rectangleWidth / 2, centerZ + rectangleDepth / 2],
    ] as ShippingPoint[];
  const placementFootprints = [localFootprint];
  const appendageFootprints: ShippingPoint[][] = [];
  const navigationObstacles: ShippingPoint[][] = [];
  const reserve = (polygon: ShippingPoint[]) => {
    placementFootprints.push(polygon);
    appendageFootprints.push(polygon);
  };
  if (variant === 'dock-bay' && object.shippingTrailerDocked) {
    // Trailer runs from 1.3 m outside the dock face to 14.9 m into the apron.
    reserve(rectangle(0, -8.1, 2.5, 13.6));
  }
  if (variant === 'dock-bay') {
    // Full stair and landing plan footprint; deck remains an elevated renderer feature.
    reserve(rectangle(3.8, 0.5, 0.9, 2));
  }
  // Forklift oscillates ±1.5m over 12s. Include wheel/body width and front forks.
  const forkliftZ = variant === 'dock-bay' ? 5.5 : variant === 'container-yard' ? 7.5 : null;
  if (forkliftZ !== null) {
    const sweep = rectangle(0, forkliftZ + 0.62, 4.62, 3.06);
    reserve(sweep);
    navigationObstacles.push(sweep);
  }
  if (variant === 'dock-bay') {
    // Reserved vehicle lane is never part of the pedestrian navmesh.
    navigationObstacles.push(rectangle(0, -8.95, 3.2, 11.9));
    for (const center of bayCenters) {
      navigationObstacles.push(
        rectangle(center[0] - 1.83, 0, 0.22, 0.34),
        rectangle(center[0] + 1.83, 0, 0.22, 0.34),
      );
    }
    // Trailer shell is formed by side rails and its rear closure, leaving the interior open.
    if (object.shippingTrailerDocked) {
      navigationObstacles.push(
        rectangle(-1.19, -8.1, 0.12, 13.6),
        rectangle(1.19, -8.1, 0.12, 13.6),
        rectangle(0, -14.84, 2.5, 0.12),
      );
    }
    for (const x of [-2.35, 2.35]) {
      const bollard = Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        return [x + Math.cos(angle) * 0.2, -0.8 + Math.sin(angle) * 0.2] as ShippingPoint;
      });
      navigationObstacles.push(bollard);
    }
  }
  return {
    dockOpening: [0, 0],
    bayCenters,
    pedestrianAnchor: anchor,
    pedestrianApproachAnchor: [3.2, 0.5],
    vehicleTarget: [0, -3],
    approachLane: [
      [0, -14.9],
      [0, -3],
    ],
    interiorLane: [
      [0, 0],
      [0, depth],
    ],
    placementFootprints,
    appendageFootprints,
    navigationObstacles,
  };
}

/** Convert object-local dock coordinates to the floor's world coordinates, including yaw. */
export function shippingWorldPoint(object: PlanObject, local: ShippingPoint): ShippingPoint {
  const cosine = Math.cos(object.yawRadians);
  const sine = Math.sin(object.yawRadians);
  const [, , depth] = object.dimensions;
  const [a, b, c, d] = object.planarMatrix ?? [1, 0, 0, 1];
  const x = (a * local[0] + c * (local[1] - depth / 2)) * object.scale[0];
  const z = (b * local[0] + d * (local[1] - depth / 2)) * object.scale[2];
  return [object.position[0] + x * cosine + z * sine, object.position[1] - x * sine + z * cosine];
}

export function shippingWorldPolygon(
  object: PlanObject,
  polygon: readonly ShippingPoint[],
): ShippingPoint[] {
  return polygon.map((point) => shippingWorldPoint(object, point));
}

export function shippingWorldObstacles(object: PlanObject): ShippingPoint[][] {
  return shippingSpatialLayout(object).navigationObstacles.map((polygon) =>
    shippingWorldPolygon(object, polygon),
  );
}
