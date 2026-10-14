import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import rawCatalog from '@/assets/metadata/catalog.v1.json';
import rawBooths from '@/assets/metadata/booth-sizes.v1.json';
import { assetCatalogSchema } from '@/features/assets/model/asset-schema.ts';
import { expansionAssetMetadata } from '@/features/assets/model/expansion-metadata.ts';
import type { FloorAuthoring, PolygonPoint } from './building-schema.ts';

type Point3 = [number, number, number];
export type AuthoredInstance = FloorAuthoring['instances'][number];
export interface AuthoredInstanceBox {
  /** Global floor coordinates; includes instance placement/yaw, excludes floor height offset. */
  position: Point3;
  halfExtents: Point3;
  rotation: Point3;
  footprint: PolygonPoint[];
  minY: number;
  maxY: number;
  /** Optional sheared convex shape: center-relative world-oriented vertices, rotation must be zero. */
  hull?: Float32Array;
}
export interface AuthoredInstancePhysical {
  provider: 'catalog' | 'external';
  scale: Point3;
  boxes: AuthoredInstanceBox[];
}
const catalog = assetCatalogSchema.parse(rawCatalog);
const cache = new WeakMap<AuthoredInstance, AuthoredInstancePhysical>();

function convexFootprint(points: Point3[]): PolygonPoint[] {
  const sorted = points
    .map(([x, , z]): PolygonPoint => [x, z])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const unique = sorted.filter(
    (point, i) =>
      !i || Math.abs(point[0] - sorted[i - 1]![0]) + Math.abs(point[1] - sorted[i - 1]![1]) > 1e-9,
  );
  const cross = (a: PolygonPoint, b: PolygonPoint, c: PolygonPoint) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const lower: PolygonPoint[] = [],
    upper: PolygonPoint[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 1e-10) {
      lower.pop();
    }
    lower.push(point);
  }
  for (const point of [...unique].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 1e-10) {
      upper.pop();
    }
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Shared immutable construction contract: compound catalog solids retain real entrance gaps. */
export function authoredInstancePhysical(item: AuthoredInstance): AuthoredInstancePhysical {
  const previous = cache.get(item);
  if (previous) {
    return previous;
  }
  const base = catalog.find((asset) => asset.id === item.assetId);
  const sized = rawBooths.find((asset) => asset.id === item.assetId);
  const expansion = expansionAssetMetadata.find((asset) => asset.id === item.assetId);
  const dimensions = base?.dimensions ?? sized?.dimensionsMetres ?? expansion?.dimensions;
  const scale: Point3 = dimensions
    ? (item.dimensions.map((value, i) => (value / dimensions[i]!) * item.scale[i]!) as Point3)
    : [...item.scale];
  const sourceBoxes = base?.colliders ??
    sized?.colliders.map((box) => ({ ...box, rotation: [0, 0, 0] as Point3 })) ??
    expansion?.colliders ?? [
      {
        position: [0, item.dimensions[1] / 2, 0] as Point3,
        halfExtents: item.dimensions.map((value) => value / 2) as Point3,
        rotation: [0, 0, 0] as Point3,
      },
    ];
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), item.yawRadians);
  const scaleVector = new Vector3(...scale);
  const boxes = sourceBoxes.map((source) => {
    const local = new Quaternion().setFromEuler(new Euler(...(source.rotation as Point3)));
    const center = new Vector3(...(source.position as Point3))
      .multiply(scaleVector)
      .applyQuaternion(yaw)
      .add(new Vector3(item.position[0], 0, item.position[1]));
    const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)].map((axis) =>
      axis.applyQuaternion(local).multiply(scaleVector).applyQuaternion(yaw),
    );
    const halfExtents = axes.map((axis, i) => axis.length() * source.halfExtents[i]!) as Point3;
    const unit = axes.map((axis) => axis.clone().normalize());
    const sheared =
      Math.abs(unit[0]!.dot(unit[1]!)) +
        Math.abs(unit[0]!.dot(unit[2]!)) +
        Math.abs(unit[1]!.dot(unit[2]!)) >
      1e-6;
    const relative: Point3[] = [];
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        for (const z of [-1, 1]) {
          relative.push(
            new Vector3()
              .addScaledVector(axes[0]!, x * source.halfExtents[0]!)
              .addScaledVector(axes[1]!, y * source.halfExtents[1]!)
              .addScaledVector(axes[2]!, z * source.halfExtents[2]!)
              .toArray() as Point3,
          );
        }
      }
    }
    const corners = relative.map((point) => new Vector3(...point).add(center).toArray() as Point3);
    const rotation = sheared
      ? new Euler()
      : new Euler().setFromRotationMatrix(new Matrix4().makeBasis(unit[0]!, unit[1]!, unit[2]!));
    return {
      position: center.toArray() as Point3,
      halfExtents,
      rotation: [rotation.x, rotation.y, rotation.z] as Point3,
      footprint: convexFootprint(corners),
      minY: Math.min(...corners.map((point) => point[1])),
      maxY: Math.max(...corners.map((point) => point[1])),
      hull: sheared ? new Float32Array(relative.flat()) : undefined,
    };
  });
  const physical: AuthoredInstancePhysical = {
    provider: dimensions ? 'catalog' : 'external',
    scale,
    boxes,
  };
  cache.set(item, physical);
  return physical;
}
