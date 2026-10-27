import { gsap } from 'gsap';
import {
  circulationLandings,
  circulationSpans,
  circulationDesign,
} from '../../model/circulation.ts';
import { objectPoints } from '../../model/geometry.ts';
import type { PlanDocument, PlanObject } from '../../model/types.ts';
import type { RouteResult, RouteSegment } from '../model/route-schema.ts';

export type Vec3 = [number, number, number];
export interface MotionLeg {
  kind: RouteSegment['kind'];
  floorId: string;
  toFloorId?: string;
  connector?: PlanObject;
  baseY: number;
  points: Vec3[];
  lengths: number[];
  length: number;
  offset: number;
  visualOffset: number;
  visualLength: number;
  treads: { polygon: [number, number][]; y: number }[];
  speed: number;
}
export interface WalkPath {
  legs: MotionLeg[];
  length: number;
  visualLength: number;
  duration: number;
  ticks: number[];
}
export const distance3 = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
export const doorEase = gsap.parseEase('power2.inOut');

function connectorProfile(
  segment: RouteSegment,
  document: PlanDocument,
): { points: Vec3[]; object?: PlanObject; baseY: number } {
  const from = segment.points[0]!,
    to = segment.points.at(-1)!;
  const source = document.floors.find((floor) => floor.source.id === segment.floorId);
  const item = source?.objects.find((object) => object.id === segment.connectorId);
  const lower = document.floors
    .flatMap((floor) => floor.objects.map((object) => ({ object, y: floor.source.heightOffset })))
    .find(
      ({ object }) =>
        item?.portalId &&
        object.portalId === item.portalId &&
        object.circulationDesign?.role === 'lower',
    );
  const object = lower?.object ?? item,
    baseY = lower?.y ?? Math.min(from[1], to[1]);
  if (!object || !segment.toFloorId) {
    return { points: segment.points, baseY };
  }
  const design = circulationDesign(object);
  if ((segment.kind === 'elevator' || segment.kind === 'escalator') && !design.running) {
    throw new Error(`${object.name} is out of service. Choose another route.`);
  }
  if (
    segment.kind === 'escalator' &&
    (design.speed <= 0 ||
      (to[1] > from[1] ? design.direction !== 'UP' : design.direction !== 'DOWN'))
  ) {
    throw new Error(
      `${object.name} is stopped or runs in the opposite direction. Choose another route.`,
    );
  }
  const world = (point: Vec3): Vec3 => {
    const [x, z] = objectPoints(object, [[point[0], point[2]]])[0]!;
    return [x, baseY + point[1] * object.scale[1], z];
  };
  if (segment.kind === 'elevator') {
    const center = world([0, 0, 0]);
    return {
      points: [
        from,
        [center[0], from[1] + 0.06, center[2]],
        [center[0], to[1] + 0.06, center[2]],
        to,
      ],
      object,
      baseY,
    };
  }
  const landings = circulationLandings(object),
    points: Vec3[] = [];
  const [bottom, top] = landings;
  if (bottom) {
    points.push(world(bottom.localPosition));
  }
  for (const span of circulationSpans(object)) {
    points.push(world([span.x, span.y0, span.from]));
    const steps = segment.kind === 'stairs' ? Math.max(2, span.steps) : 1;
    for (let i = 1; i <= steps; i++) {
      points.push(
        world([
          span.x,
          span.y0 + ((span.y1 - span.y0) * i) / steps,
          span.from + ((span.to - span.from) * i) / steps,
        ]),
      );
    }
  }
  if (top) {
    points.push(world(top.localPosition));
  }
  if (to[1] < from[1]) {
    points.reverse();
  }
  return { points: [from, ...points, to], object, baseY };
}

/** Preserve the safe funnel polyline. An unconstrained spline could cut through a wall. */
export function compilePath(route: RouteResult, document: PlanDocument): WalkPath {
  let offset = 0,
    visualOffset = 0;
  const ticks: number[] = [];
  const legs = route.segments.map((segment): MotionLeg => {
    const profile = segment.toFloorId
      ? connectorProfile(segment, document)
      : { points: segment.points, baseY: segment.points[0]![1], object: undefined };
    const points = profile.points.filter(
      (point, index, array) =>
        segment.kind === 'elevator' || !index || distance3(point, array[index - 1]!) > 1e-6,
    );
    if (!points.length) {
      points.push(segment.points[0]!);
    }
    const lengths = [0];
    for (let i = 1; i < points.length; i++) {
      lengths.push(lengths[i - 1]! + distance3(points[i - 1]!, points[i]!));
    }
    const length = lengths.at(-1)!,
      speed =
        segment.kind === 'stairs'
          ? 0.6
          : segment.kind === 'ramp'
            ? 0.8
            : segment.kind === 'escalator'
              ? circulationDesign(profile.object!).speed
              : segment.kind === 'elevator'
                ? 1.5
                : 1.2;
    ticks.push(...lengths.map((distance) => offset + distance));
    const result: MotionLeg = {
      kind: segment.kind,
      floorId: segment.floorId,
      toFloorId: segment.toFloorId,
      connector: profile.object,
      baseY: profile.baseY,
      points,
      lengths,
      length,
      offset,
      visualOffset,
      visualLength: segment.lengthM,
      treads:
        segment.kind === 'stairs' && profile.object
          ? circulationSpans(profile.object).flatMap((span) => {
              const count = Math.max(1, span.steps - 1);
              const going = (span.to - span.from) / count;
              const object = profile.object!;
              return Array.from({ length: count }, (_, i) => ({
                polygon: objectPoints(object, [
                  [span.x - span.width / 2, span.from + i * going],
                  [span.x + span.width / 2, span.from + i * going],
                  [span.x + span.width / 2, span.from + (i + 1) * going],
                  [span.x - span.width / 2, span.from + (i + 1) * going],
                ]),
                y:
                  profile.baseY +
                  (span.y0 + ((i + 1) * (span.y1 - span.y0)) / span.steps) * object.scale[1],
              }));
            })
          : [],
      speed,
    };
    offset += length;
    visualOffset += segment.lengthM;
    return result;
  });
  return {
    legs,
    length: offset,
    visualLength: visualOffset,
    duration: legs.reduce((sum, leg) => {
      if (leg.kind !== 'elevator') {
        return sum + leg.length / leg.speed;
      }
      const [a, inside, upper, b] = leg.points as [Vec3, Vec3, Vec3, Vec3];
      const initialY =
        leg.connector && circulationDesign(leg.connector).cabinLevel === 'upper'
          ? leg.connector.dimensions[1]
          : 0;
      const callDistance = Math.abs(initialY - (a[1] - leg.baseY));
      return (
        sum +
        3.6 +
        distance3(a, inside) / 1.2 +
        distance3(inside, upper) / 1.5 +
        distance3(upper, b) / 1.2 +
        (callDistance > 0.01 ? 1.2 + callDistance / 1.5 : 0)
      );
    }, 0),
    ticks,
  };
}

/** Binary-search arc length, writing into caller-owned vectors. No allocation in the render loop. */
export function sampleLeg(leg: MotionLeg, s: number, out: Vec3, tangent: Vec3) {
  if (leg.points.length < 2) {
    [out[0], out[1], out[2]] = leg.points[0]!;
    tangent[0] = 0;
    tangent[1] = 0;
    tangent[2] = -1;
    return;
  }
  let lo = 1,
    hi = leg.lengths.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (leg.lengths[mid]! < s) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const a = leg.points[lo - 1]!,
    b = leg.points[lo]!,
    span = Math.max(1e-8, leg.lengths[lo]! - leg.lengths[lo - 1]!);
  const t = Math.min(1, Math.max(0, (s - leg.lengths[lo - 1]!) / span));
  for (let axis = 0; axis < 3; axis++) {
    out[axis] = a[axis]! + (b[axis]! - a[axis]!) * t;
    tangent[axis] = (b[axis]! - a[axis]!) / span;
  }
}
