import { objectPoints } from './geometry.ts';
import { diningLayout, type Point2 } from './dining.ts';
import type { PlanObject } from './types.ts';

export type DiningAnchorKind = 'host' | 'seat';

/** Service-window frame for vendor models whose rendered service face is authored on local +Z. */
export function vendorServiceFrame(vendor: PlanObject): { point: Point2; normal: Point2 } | null {
  if (vendor.recipe !== 'food-kiosk' && vendor.recipe !== 'food-truck') {
    return null;
  }
  const point = objectPoints(vendor, [[0, vendor.dimensions[2] / 2]])[0]!;
  return {
    point,
    normal: [Math.sin(vendor.yawRadians), Math.cos(vendor.yawRadians)],
  };
}

/** Align a chosen dining edge with the vendor's rendered service-window axis, four metres out. */
export function snapDiningToVendor(
  dining: PlanObject,
  vendor: PlanObject,
  edgeIndex: number,
): Pick<PlanObject, 'position' | 'yawRadians'> | null {
  const frame = vendorServiceFrame(vendor);
  if (dining.recipe !== 'dining' || !frame || edgeIndex < 0 || edgeIndex >= dining.polygon.length) {
    return null;
  }
  const start = dining.polygon[edgeIndex]!;
  const end = dining.polygon[(edgeIndex + 1) % dining.polygon.length]!;
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const theta = Math.atan2(dz, dx);
  let yawRadians = theta + vendor.yawRadians;
  const ccw =
    dining.polygon.reduce((sum, point, index) => {
      const next = dining.polygon[(index + 1) % dining.polygon.length]!;
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) > 0;
  const localOutward: Point2 = ccw ? [dz, -dx] : [-dz, dx];
  const outwardLength = Math.hypot(localOutward[0], localOutward[1]) || 1;
  const outward = [
    (localOutward[0] * Math.cos(yawRadians) + localOutward[1] * Math.sin(yawRadians)) /
      outwardLength,
    (-localOutward[0] * Math.sin(yawRadians) + localOutward[1] * Math.cos(yawRadians)) /
      outwardLength,
  ] as Point2;
  if (outward[0] * frame.normal[0] + outward[1] * frame.normal[1] > 0) {
    yawRadians += Math.PI;
  }
  const rotated = { ...dining, position: [0, 0] as Point2, yawRadians };
  const midpoint: Point2 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const edgeWorld = objectPoints(rotated, [midpoint])[0]!;
  return {
    yawRadians,
    position: [
      frame.point[0] + frame.normal[0] * 4 - edgeWorld[0],
      frame.point[1] + frame.normal[1] * 4 - edgeWorld[1],
    ],
  };
}

/** Return the center of a safe authored service/seat landing in floor world coordinates. */
export function diningAnchorPoint(
  object: PlanObject,
  kind: DiningAnchorKind,
  chairId?: string,
  from?: Point2,
): Point2 | null {
  if (object.recipe !== 'dining') {
    return null;
  }
  const layout = diningLayout(object);
  if (kind === 'host') {
    const hosts = layout.props.filter((prop) => prop.kind === 'host');
    const worldHosts = hosts.map((prop) => ({ point: hostEntryPoint(object, prop.center), prop }));
    const selected = from
      ? worldHosts.sort((a, b) => distance(a.point, from) - distance(b.point, from))[0]
      : worldHosts[0];
    if (!selected) {
      return diningAnchorPoint(object, 'seat', undefined, from);
    }
    return selected.point;
  }
  const chairs = layout.tables.flatMap((table) => table.chairs);
  const selected = chairId ? chairs.find((chair) => chair.id === chairId) : undefined;
  const candidates = selected ? [selected] : chairs;
  const worldCandidates = candidates.map((chair) => ({
    point: objectPoints(object, [chair.approachPoint])[0]!,
    chair,
  }));
  const nearest = from
    ? worldCandidates.sort((a, b) => distance(a.point, from) - distance(b.point, from))[0]
    : worldCandidates[0];
  return nearest?.point ?? null;
}

function hostEntryPoint(object: PlanObject, host: Point2): Point2 {
  let nearest = { distance: Infinity, point: object.polygon[0]!, outward: [0, 0] as Point2 };
  const ccw =
    object.polygon.reduce((sum, point, index) => {
      const next = object.polygon[(index + 1) % object.polygon.length]!;
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) > 0;
  for (let index = 0; index < object.polygon.length; index++) {
    const a = object.polygon[index]!;
    const b = object.polygon[(index + 1) % object.polygon.length]!;
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const lengthSquared = dx * dx + dz * dz || 1;
    const t = Math.max(
      0,
      Math.min(1, ((host[0] - a[0]) * dx + (host[1] - a[1]) * dz) / lengthSquared),
    );
    const point: Point2 = [a[0] + dx * t, a[1] + dz * t];
    const d = distance(host, point);
    if (d < nearest.distance) {
      const length = Math.sqrt(lengthSquared);
      nearest = {
        distance: d,
        point,
        outward: ccw ? [dz / length, -dx / length] : [-dz / length, dx / length],
      };
    }
  }
  return objectPoints(object, [
    [nearest.point[0] + nearest.outward[0] * 0.75, nearest.point[1] + nearest.outward[1] * 0.75],
  ])[0]!;
}

function distance(a: Point2, b: Point2) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
