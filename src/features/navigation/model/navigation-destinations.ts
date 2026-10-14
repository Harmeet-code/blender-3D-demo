import type { NormalizedLayout } from '@/features/building/model/normalize-layout.ts';
import { roomEntrance } from '@/features/building/model/room-assembly.ts';

export interface NavigationDestination {
  id: string;
  label: string;
  floorId: string;
  kind: 'room' | 'poi' | 'start' | 'avatar' | 'point';
  category: string;
  position: [number, number, number];
  roomId?: string;
  amenity?: string;
}

interface DestinationIndex {
  destinations: readonly NavigationDestination[];
  byId: ReadonlyMap<string, NavigationDestination>;
}
const indexes = new WeakMap<NormalizedLayout, DestinationIndex>();

/** Normalized floor coordinates are already metric; never recalibrate these destinations. */
function indexDestinations(layout: NormalizedLayout): DestinationIndex {
  const cached = indexes.get(layout);
  if (cached) {
    return cached;
  }
  const floors = new Map(layout.floors.map((floor) => [floor.id, floor]));
  const used = new Set(layout.rooms.map((room) => room.id));
  const uniqueId = (base: string) => {
    let id = base;
    let suffix = 2;
    while (used.has(id)) {
      id = `${base}:${suffix++}`;
    }
    used.add(id);
    return id;
  };
  const destinations: NavigationDestination[] = layout.rooms.flatMap((room) => {
    const floor = floors.get(room.floorId);
    if (!floor) {
      return [];
    }
    const entrance = room.entrance?.position ?? roomEntrance(room).position;
    return [
      {
        id: room.id,
        label: room.label ?? room.id,
        floorId: room.floorId,
        kind: 'room' as const,
        category: room.type,
        roomId: room.id,
        position: [entrance[0], floor.heightOffset + 1.2, entrance[1]] as [number, number, number],
      },
    ];
  });
  for (const floor of layout.floors) {
    const scopedFloor = encodeURIComponent(floor.id);
    for (const poi of floor.authoring?.pois ?? []) {
      destinations.push({
        id: uniqueId(`poi:${scopedFloor}:${encodeURIComponent(poi.id)}`),
        label: poi.label,
        floorId: floor.id,
        kind: 'poi',
        category: poi.amenity ?? poi.type,
        amenity:
          poi.amenity ?? (poi.type === 'exit' || poi.type === 'information' ? poi.type : undefined),
        position: [poi.position[0], floor.heightOffset + 1.2, poi.position[1]],
      });
    }
    for (const portal of layout.portals) {
      const entry = portal.entries?.find((entry) => entry.floorId === floor.id);
      if (portal.type !== 'elevator' || !entry) {
        continue;
      }
      destinations.push({
        id: uniqueId(`portal:${scopedFloor}:${encodeURIComponent(portal.id)}`),
        label: `Elevator ${portal.id}`,
        floorId: floor.id,
        kind: 'poi',
        category: 'elevator',
        amenity: 'elevator',
        position: [entry.position[0], floor.heightOffset + 1.2, entry.position[1]],
      });
    }
    if (floor.authoring) {
      destinations.push({
        id: uniqueId(`start:${scopedFloor}`),
        label: `${floor.name} avatar start`,
        floorId: floor.id,
        kind: 'start',
        category: 'start',
        position: [floor.authoring.spawn[0], floor.heightOffset + 1.2, floor.authoring.spawn[1]],
      });
    }
  }
  const index = {
    destinations,
    byId: new Map(destinations.map((destination) => [destination.id, destination])),
  };
  indexes.set(layout, index);
  return index;
}

export function getNavigationDestinations(
  layout: NormalizedLayout,
): readonly NavigationDestination[] {
  return indexDestinations(layout).destinations;
}

export function resolveNavigationDestination(
  layout: NormalizedLayout,
  id: string,
): NavigationDestination | undefined {
  return indexDestinations(layout).byId.get(id);
}

/** Dynamic origin is sampled on demand, outside the immutable destination index. */
export function currentAvatarDestination(
  layout: NormalizedLayout,
  avatar: { floorId: string; position: [number, number, number] },
): NavigationDestination {
  let id = 'avatar:current';
  let suffix = 2;
  while (indexDestinations(layout).byId.has(id)) {
    id = `avatar:current:${suffix++}`;
  }
  return {
    id,
    label: 'Your current location',
    floorId: avatar.floorId,
    kind: 'avatar',
    category: 'current location',
    position: [...avatar.position],
  };
}

/** Ephemeral metric point; it is never written into the venue's named destination index. */
export function floorPointDestination(
  layout: NormalizedLayout,
  floorId: string,
  point: readonly [number, number],
  id = `point:${crypto.randomUUID()}`,
): NavigationDestination | undefined {
  const floor = layout.floors.find((candidate) => candidate.id === floorId);
  if (!floor || !point.every(Number.isFinite)) {
    return undefined;
  }
  return {
    id,
    label: `Point (${point[0].toFixed(2)}, ${point[1].toFixed(2)}) m`,
    floorId,
    kind: 'point',
    category: 'floor point',
    position: [point[0], floor.heightOffset + 1.2, point[1]],
  };
}
