import type { Room } from './building-schema.ts';
import { boothModelFor } from '@/features/assets/model/booth-models.ts';
import catalogMetadata from '@/assets/metadata/booth-frame.v1.json';
import { rawRoomEntrance, rectangleFrame, interiorPoint } from './room-frame.ts';
import { spansAtEntrance } from './wall-spec.ts';
import { wallEnvelope } from './wall-envelope.ts';

export interface PhysicalBox {
  position: [number, number, number];
  halfExtents: [number, number, number];
  yaw: number;
}
export interface BoothPhysical {
  provider: 'premium' | 'catalog' | 'procedural';
  model?: ReturnType<typeof boothModelFor>;
  frame: ReturnType<typeof rectangleFrame>;
  entrance: ReturnType<typeof rawRoomEntrance>;
  opening: number;
  height: number;
  thickness: number;
  spans: ReturnType<typeof spansAtEntrance>;
  boxes: PhysicalBox[];
  warning?: string;
  interior: [number, number];
}
const cache = new WeakMap<Room, BoothPhysical>();

/** One immutable contract feeds visual provider, physics, navigation and openings. */
export function boothPhysical(room: Room): BoothPhysical {
  const previous = cache.get(room);
  if (previous) {
    return previous;
  }
  const frame = rectangleFrame(room.polygon);
  const model = room.dimensionsFeet ? boothModelFor(room.dimensionsFeet) : undefined;
  const modelReference =
    !!model && room.boothAssetRef?.id === model.id && room.boothAssetRef.version === 1;
  const modelSelected = !!model && (room.boothModelUrl === model.url || modelReference);
  let entrance = rawRoomEntrance(room);
  let yaw = frame?.yaw ?? 0;
  const validSize =
    frame &&
    model &&
    Math.abs(frame.width - model.dimensionsMetres[0]!) < 1e-4 &&
    Math.abs(frame.depth - model.dimensionsMetres[2]!) < 1e-4;
  if (validSize && !room.entrance && modelSelected) {
    entrance = {
      position: [
        frame.center[0] + (Math.sin(yaw) * frame.depth) / 2,
        frame.center[1] + (Math.cos(yaw) * frame.depth) / 2,
      ],
      yawRadians: yaw,
    };
  }
  if (frame) {
    const front = (angle: number) => [
      frame.center[0] + (Math.sin(angle) * frame.depth) / 2,
      frame.center[1] + (Math.cos(angle) * frame.depth) / 2,
    ];
    const opposite = front(yaw + Math.PI);
    if (
      Math.hypot(opposite[0]! - entrance.position[0], opposite[1]! - entrance.position[1]) < 1e-4
    ) {
      yaw += Math.PI;
    }
  }
  const frontFits =
    frame &&
    Math.hypot(
      frame.center[0] + (Math.sin(yaw) * frame.depth) / 2 - entrance.position[0],
      frame.center[1] + (Math.cos(yaw) * frame.depth) / 2 - entrance.position[1],
    ) < 1e-4;
  const premium = !!(room.type === 'booth' && validSize && frontFits && modelSelected);
  const catalogReference =
    !room.boothAssetRef ||
    (room.boothAssetRef.id === 'booth-frame' && room.boothAssetRef.version === 1);
  const catalog =
    room.type === 'booth' &&
    catalogReference &&
    !room.boothModelUrl &&
    frame &&
    Math.abs(frame.width - 4) < 0.005 &&
    Math.abs(frame.depth - 4) < 0.005 &&
    frontFits;
  const opening = premium || catalog ? frame!.width : 2;
  const height = premium
    ? model!.dimensionsMetres[1]!
    : catalog
      ? 2.5
      : room.type === 'booth'
        ? 2.6
        : 3;
  const thickness = premium ? 0.08 : catalog ? 0.1 : 0.15;
  const spans = spansAtEntrance(room.polygon, entrance.position, opening);
  const boxes: PhysicalBox[] =
    premium || catalog
      ? (premium ? model!.colliders : catalogMetadata.colliders).map((box) => ({
          position: [
            frame!.center[0] + box.position[0]! * Math.cos(yaw) + box.position[2]! * Math.sin(yaw),
            box.position[1]!,
            frame!.center[1] - box.position[0]! * Math.sin(yaw) + box.position[2]! * Math.cos(yaw),
          ],
          halfExtents: box.halfExtents as [number, number, number],
          yaw,
        }))
      : spans.flatMap(({ a, b }) => {
          const box = wallEnvelope(room.polygon, a, b, height, thickness);
          return box ? [box] : [];
        });
  const result: BoothPhysical = {
    provider: premium ? 'premium' : catalog ? 'catalog' : 'procedural',
    model: premium ? model : undefined,
    frame: frame ? { ...frame, yaw } : null,
    entrance,
    opening,
    height,
    thickness,
    spans,
    boxes,
    warning:
      (room.boothModelUrl && !premium) || (!premium && !catalogReference)
        ? `${room.id}: model does not match a verified footprint/opening; using the detailed polygon assembly. Uploaded GLBs can be placed as authored artifacts with explicit dimensions.`
        : undefined,
    interior: interiorPoint(room.polygon),
  };
  // Keep unrelated room kinds on the legacy perimeter contract.
  if (room.type !== 'booth') {
    result.provider = 'procedural';
  }
  cache.set(room, result);
  return result;
}

export function boxFootprint(box: PhysicalBox): Array<[number, number]> {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx = 0, sz = 0]) => {
    const x = sx * box.halfExtents[0],
      z = sz * box.halfExtents[2];
    return [
      box.position[0] + x * Math.cos(box.yaw) + z * Math.sin(box.yaw),
      box.position[2] - x * Math.sin(box.yaw) + z * Math.cos(box.yaw),
    ];
  });
}
export function declaredSizeMatches(room: Room) {
  if (!room.dimensionsFeet) {
    return true;
  }
  const frame = rectangleFrame(room.polygon);
  return (
    !!frame &&
    Math.abs(frame.width - room.dimensionsFeet[0] * 0.3048) < 1e-4 &&
    Math.abs(frame.depth - room.dimensionsFeet[1] * 0.3048) < 1e-4
  );
}
