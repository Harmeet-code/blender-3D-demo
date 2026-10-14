import { boothPhysical } from './booth-physical.ts';
import { authoredWallBoxes } from './authored-walls.ts';
import { authoredInstancePhysical } from './authored-instance-physical.ts';
import type { NormalizedLayout } from './normalize-layout.ts';

const floorKeys = new WeakMap<NormalizedLayout, Map<string, string>>();
const layoutKeys = new WeakMap<NormalizedLayout, string>();

/** Only inputs consumed by the navigation builder; labels/images/materials do not invalidate meshes. */
export function navigationFloorKey(layout: NormalizedLayout, floorId: string): string {
  let keys = floorKeys.get(layout);
  if (!keys) {
    keys = new Map();
    floorKeys.set(layout, keys);
  }
  const cached = keys.get(floorId);
  if (cached !== undefined) {
    return cached;
  }
  const floor = layout.floors.find((candidate) => candidate.id === floorId);
  const key = JSON.stringify({
    floorId,
    height: floor?.heightOffset,
    boundary: floor?.authoring?.boundary,
    walkableZones: floor?.authoring?.zones
      ?.filter((zone) => zone.type === 'walkable')
      .map((zone) => zone.polygon),
    obstacles: floor?.authoring?.obstacles,
    walls: floor?.authoring?.walls?.flatMap(authoredWallBoxes),
    blockedZones: floor?.authoring?.zones
      ?.filter((zone) => zone.type === 'blocked')
      .map((zone) => zone.polygon),
    instances: floor?.authoring?.instances
      .filter((instance) => instance.collidable)
      .map((instance) => ({
        assetId: instance.assetId,
        boxes: authoredInstancePhysical(instance).boxes.map((box) => ({
          footprint: box.footprint,
          minY: box.minY,
          maxY: box.maxY,
        })),
        position: instance.position,
        dimensions: instance.dimensions,
        scale: instance.scale,
        yaw: instance.yawRadians,
      })),
    rooms: layout.rooms
      .filter((room) => room.floorId === floorId)
      .map((room) => ({
        type: room.type,
        polygon: room.polygon,
        boxes: boothPhysical(room).boxes,
        entrance: boothPhysical(room).entrance,
      })),
  });
  keys.set(floorId, key);
  return key;
}

export function navigationLayoutKey(layout: NormalizedLayout): string {
  const cached = layoutKeys.get(layout);
  if (cached !== undefined) {
    return cached;
  }
  const key = JSON.stringify({
    buildingId: layout.buildingId,
    floors: layout.floors.map((floor) => navigationFloorKey(layout, floor.id)),
    destinations: layout.rooms.map((room) => [room.id, room.floorId]),
    portals: layout.portals,
  });
  layoutKeys.set(layout, key);
  return key;
}
