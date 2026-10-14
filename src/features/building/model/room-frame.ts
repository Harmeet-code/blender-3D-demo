import type { Room } from './building-schema.ts';
import {
  polygonEdges,
  polygonBounds,
  signedArea,
  pointInPolygon,
} from '@/utils/geometry/polygon.ts';
import { ShapeUtils, Vector2 } from 'three';

export function rawRoomEntrance(room: Room) {
  if (room.entrance) {
    return room.entrance;
  }
  const edge = polygonEdges(room.polygon).reduce((longest, current) =>
    Math.hypot(current[1][0] - current[0][0], current[1][1] - current[0][1]) >
    Math.hypot(longest[1][0] - longest[0][0], longest[1][1] - longest[0][1])
      ? current
      : longest,
  );
  const dx = edge[1][0] - edge[0][0],
    dz = edge[1][1] - edge[0][1];
  const sign = signedArea(room.polygon) > 0 ? 1 : -1;
  return {
    position: [(edge[0][0] + edge[1][0]) / 2, (edge[0][1] + edge[1][1]) / 2] as [number, number],
    yawRadians: Math.atan2(sign * dz, -sign * dx),
  };
}

export function rectangleFrame(polygon: Room['polygon']) {
  if (polygon.length !== 4) {
    return null;
  }
  const [a, b, c, d] = polygon as [
    Room['polygon'][number],
    Room['polygon'][number],
    Room['polygon'][number],
    Room['polygon'][number],
  ];
  const ux = b[0] - a[0],
    uz = b[1] - a[1],
    vx = d[0] - a[0],
    vz = d[1] - a[1];
  const width = Math.hypot(ux, uz),
    depth = Math.hypot(vx, vz);
  if (
    width <= 0 ||
    depth <= 0 ||
    Math.abs(ux * vx + uz * vz) > width * depth * 1e-6 ||
    Math.hypot(c[0] - b[0] - d[0] + a[0], c[1] - b[1] - d[1] + a[1]) > 1e-5
  ) {
    return null;
  }
  return {
    width,
    depth,
    yaw: -Math.atan2(uz, ux) + (ux * vz - uz * vx < 0 ? Math.PI : 0),
    center: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2] as [number, number],
  };
}

/** A concave polygon's bounds center is not necessarily a valid placement point. */
export function interiorPoint(polygon: Room['polygon']): [number, number] {
  const bounds = polygonBounds(polygon);
  const center: [number, number] = [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  ];
  if (pointInPolygon(center, polygon)) {
    return center;
  }
  for (const face of ShapeUtils.triangulateShape(
    polygon.map(([x, z]) => new Vector2(x, z)),
    [],
  )) {
    const points = face.map((index) => polygon[index]!);
    const candidate: [number, number] = [
      points.reduce((sum, p) => sum + p[0], 0) / 3,
      points.reduce((sum, p) => sum + p[1], 0) / 3,
    ];
    if (pointInPolygon(candidate, polygon)) {
      return candidate;
    }
  }
  return [...polygon[0]!] as [number, number];
}
