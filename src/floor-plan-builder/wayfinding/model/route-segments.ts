import { circulationEntry } from '../../model/circulation.ts';
import type { PlanRoute } from '../../model/directions.ts';
import type { PlanDocument } from '../../model/types.ts';
import type { RouteSegment } from './route-schema.ts';

type V3 = [number, number, number];
export const WALK_M_S = 1.2;
const distance = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function segmentLength(points: V3[]) {
  return points.reduce(
    (sum, point, index) => sum + (index ? distance(points[index - 1]!, point) : 0),
    0,
  );
}

/** Preserve floor identity; connector legs never become a straight line across a floor. */
export function measuredSegments(
  route: PlanRoute,
  document: PlanDocument,
  start: V3,
  dest: V3,
): RouteSegment[] {
  const raw = route.straight?.length ? route.straight : route.segments;
  const walks = raw
    .map((segment, index): RouteSegment => {
      const elevation =
        document.floors.find((floor) => floor.source.id === segment.floorId)?.source.heightOffset ??
        0;
      const points: V3[] = segment.points.map(([x, z]) => [x, elevation, z]);
      if (!index) {
        points.unshift(start);
      }
      if (index === raw.length - 1) {
        points.push(dest);
      }
      const clean = points.filter((point, i) => !i || distance(point, points[i - 1]!) > 1e-5);
      const lengthM = segmentLength(clean);
      return {
        kind: 'walk',
        floorId: segment.floorId,
        points: clean,
        lengthM,
        seconds: lengthM / WALK_M_S,
      };
    })
    .filter((segment) => segment.points.length);
  const result: RouteSegment[] = [];
  walks.forEach((segment, index) => {
    result.push(segment);
    const next = walks[index + 1];
    if (!next || next.floorId === segment.floorId) {
      return;
    }
    const from = segment.points.at(-1)!,
      to = next.points[0]!;
    const floor = document.floors.find((item) => item.source.id === segment.floorId);
    const nextFloor = document.floors.find((item) => item.source.id === next.floorId);
    const match = floor?.objects.find((object) => {
      if (
        !['stairs', 'elevator', 'escalator', 'ramp'].includes(object.recipe) ||
        !object.portalId
      ) {
        return false;
      }
      const other = nextFloor?.objects.find((candidate) => candidate.portalId === object.portalId);
      if (!other) {
        return false;
      }
      const a = circulationEntry(object),
        b = circulationEntry(other);
      return (
        Math.hypot(a[0] - from[0], a[1] - from[2]) < 1 && Math.hypot(b[0] - to[0], b[1] - to[2]) < 1
      );
    });
    const kind = match?.recipe as RouteSegment['kind'] | undefined;
    const lengthM = distance(from, to);
    const speed =
      kind === 'stairs'
        ? 0.6
        : kind === 'ramp'
          ? 0.8
          : kind === 'elevator'
            ? 1.5
            : kind === 'escalator'
              ? 0.5
              : WALK_M_S;
    result.push({
      kind: kind ?? 'walk',
      floorId: segment.floorId,
      toFloorId: next.floorId,
      ...(match ? { connectorId: match.id } : {}),
      points: [from, to],
      lengthM,
      seconds: lengthM / speed + (kind === 'elevator' ? 8 : 0),
    });
  });
  return result;
}

export function segmentInstructions(
  segments: RouteSegment[],
  document: PlanDocument,
  destination: string,
): string[] {
  const instructions: string[] = [];
  for (const segment of segments) {
    if (segment.toFloorId) {
      const name =
        document.floors.find((floor) => floor.source.id === segment.toFloorId)?.source.name ??
        segment.toFloorId;
      instructions.push(
        `Take ${segment.kind === 'walk' ? 'the connector' : `the ${segment.kind}`} to ${name}.`,
      );
      continue;
    }
    let travelled = 0;
    for (let i = 1; i < segment.points.length; i++) {
      const a = segment.points[i - 1]!,
        b = segment.points[i]!,
        c = segment.points[i + 1];
      travelled += distance(a, b);
      if (!c) {
        continue;
      }
      const before = Math.atan2(b[2] - a[2], b[0] - a[0]),
        after = Math.atan2(c[2] - b[2], c[0] - b[0]);
      const turn = Math.atan2(Math.sin(after - before), Math.cos(after - before));
      if (Math.abs(turn) < 0.35 || travelled < 0.1) {
        continue;
      }
      const landmark = document.floors
        .find((floor) => floor.source.id === segment.floorId)
        ?.objects.map((object) => ({
          name: object.name,
          distance: Math.hypot(object.position[0] - b[0], object.position[1] - b[2]),
        }))
        .filter((object) => object.distance < 4)
        .sort((x, y) => x.distance - y.distance)[0];
      instructions.push(
        `Walk ${travelled.toFixed(0)} m, turn ${turn > 0 ? 'right' : 'left'}${landmark ? ` at ${landmark.name}` : ''}.`,
      );
      travelled = 0;
    }
    if (travelled > 0.1) {
      instructions.push(`Continue ${travelled.toFixed(0)} m.`);
    }
  }
  return [...instructions.slice(0, 63), `Arrive at ${destination}.`].map((text) =>
    text.length > 280 ? `${text.slice(0, 277)}…` : text,
  );
}
