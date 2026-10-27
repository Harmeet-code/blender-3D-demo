import {
  buildingLayoutSchema,
  type BuildingLayout,
  type FloorAuthoring,
  type Room,
  type Portal,
} from '@/features/building/model/building-schema.ts';
import { sourceToMetres, metresToSource } from '@/features/building/model/floor-coordinates.ts';
import { polygonBounds, signedArea, segmentDistance } from '@/utils/geometry/polygon.ts';
import {
  objectSchema,
  isBooth,
  isConnector,
  type PlanDocument,
  type PlanFloor,
  type PlanObject,
} from './types.ts';
import { rectangle } from './inventory.ts';
import { footprint, toLocal, gateEdge, objectPoints } from './geometry.ts';
import { referencePoint, referenceYaw } from './coordinates.ts';
import { boothEdges } from './booth.ts';
import { circulationEntry, circulationLinkError } from './circulation.ts';
import { infoCustomerNode } from './information.ts';
import { kioskQueueEntryLocal } from './kiosk.ts';
import { waterApproachNode } from './water.ts';
import { firstAidEntryLocal } from './firstaid.ts';
import { exitSinkLocal } from './exit.ts';
export { decodeRecipe, decodeManagedObject, encodeRecipe, RECIPE_PREFIX } from './recipe-codec.ts';
import { decodeManagedObject, decodeRecipe, encodeRecipe } from './recipe-codec.ts';
export function blankFloor(name = 'Ground floor', heightOffset = 0): PlanFloor {
  return {
    referenceCoordinates: { units: 'meters' },
    source: {
      id: crypto.randomUUID(),
      name,
      heightOffset,
      image: '',
      coordinateSystem: { units: 'meters' },
      calibrationStatus: 'confirmed',
    },
    boundary: [
      [0, 0],
      [40, 0],
      [40, 32],
      [0, 32],
    ],
    spawn: [2, 2],
    objects: [],
    zones: [],
  };
}
export function blankDocument(eventId: string): PlanDocument {
  return {
    baseline: { buildingId: eventId, schemaVersion: 2, floors: [], rooms: [], portals: [] },
    floors: [blankFloor()],
  };
}
function legacyObject(instance: FloorAuthoring['instances'][number], floor: PlanFloor): PlanObject {
  return objectSchema.parse({
    id: instance.id,
    recipe: 'legacy',
    name: instance.assetId?.trim() || 'Imported object',
    managed: false,
    position: sourceToMetres(instance.position, floor.source.coordinateSystem),
    yawRadians: instance.yawRadians,
    scale: instance.scale,
    dimensions: instance.dimensions,
    polygon: rectangle(instance.dimensions[0], instance.dimensions[2]),
    collidable: instance.collidable,
    color: '#89949f',
    colorMode: 'explicit',
    legacyAssetId: instance.assetId,
    legacyUrl: instance.url,
  });
}
function inferGate(object: PlanObject, point: [number, number], yaw?: number): PlanObject['gate'] {
  const polygon = footprint(object);
  return (['front', 'back', 'left', 'right'] as const)
    .map((gate) => {
      const index = gateEdge(object.polygon, gate);
      return {
        gate,
        distance: segmentDistance(point, polygon[index]!, polygon[(index + 1) % polygon.length]!),
        alignment:
          yaw === undefined ? 0 : Math.cos(gateEntrance({ ...object, gate }).yawRadians - yaw),
      };
    })
    .sort((a, b) =>
      Math.abs(a.distance - b.distance) > 1e-8
        ? a.distance - b.distance
        : b.alignment - a.alignment,
    )[0]!.gate;
}
export function decodeLayout(input: unknown): PlanDocument {
  const baseline = buildingLayoutSchema.parse(input);
  const floors = baseline.floors.map((source): PlanFloor => {
    const convert = (point: [number, number]) => sourceToMetres(point, source.coordinateSystem);
    const fallback =
      source.authoring?.boundary ??
      (source.coordinateSystem?.units === 'pixels' && source.authoring?.imageSize
        ? ([
            [0, 0],
            [source.authoring.imageSize[0], 0],
            [...source.authoring.imageSize],
            [0, source.authoring.imageSize[1]],
          ] as [number, number][])
        : ([
            [0, 0],
            [40, 0],
            [40, 32],
            [0, 32],
          ] as [number, number][]));
    const floor: PlanFloor = {
      source,
      referenceCoordinates: source.coordinateSystem ?? { units: 'meters' },
      referenceRooms: baseline.rooms.filter(
        (room) => room.floorId === source.id && room.type !== 'booth',
      ),
      boundary: fallback.map(convert),
      spawn: convert(source.authoring?.spawn ?? [2, 2]),
      objects: [],
      zones: (source.authoring?.zones ?? []).map((zone) =>
        Object.assign({}, zone, {
          polygon: zone.polygon.map(convert),
        }),
      ),
    };
    for (const instance of source.authoring?.instances ?? []) {
      const metadata = decodeManagedObject(instance.assetId, {
        ...instance,
        position: convert(instance.position),
      });
      floor.objects.push(metadata ?? legacyObject(instance, floor));
    }
    for (const room of baseline.rooms.filter(
      (item) => item.floorId === source.id && item.type === 'booth',
    )) {
      const existing = floor.objects.find((object) => object.id === room.id);
      const points = room.polygon.map(convert);
      if (existing) {
        const local = toLocal(points, existing.position, existing.yawRadians).map(
          ([x, z]): [number, number] => [x / existing.scale[0], z / existing.scale[2]],
        );
        const bounds = polygonBounds(local);
        Object.assign(existing, {
          name: room.label?.trim() || existing.name,
          price: room.price ?? existing.price,
          polygon: local,
          dimensions: [
            bounds.maxX - bounds.minX,
            existing.dimensions[1],
            bounds.maxZ - bounds.minZ,
          ],
          legacyRoom: true,
        });
      } else {
        const bounds = polygonBounds(points);
        const position: [number, number] = [
          (bounds.minX + bounds.maxX) / 2,
          (bounds.minZ + bounds.maxZ) / 2,
        ];
        floor.objects.push(
          objectSchema.parse({
            id: room.id,
            recipe: 'booth',
            name: room.label?.trim() || room.id,
            boothNumber: room.label ?? room.id,
            managed: false,
            position,
            yawRadians: 0,
            scale: [1, 1, 1],
            dimensions: [bounds.maxX - bounds.minX, 2.6, bounds.maxZ - bounds.minZ],
            polygon: toLocal(points, position),
            collidable: true,
            price: room.price ?? 0,
            legacyRoom: true,
          }),
        );
      }
      if (room.entrance) {
        const object = floor.objects.find((item) => item.id === room.id)!;
        object.gate = inferGate(object, convert(room.entrance.position), room.entrance.yawRadians);
      }
    }
    // Canonical POIs without instances still need selectable, editable authoring markers.
    floor.ownedPoiIds = (source.authoring?.pois ?? []).map((poi) => poi.id);
    for (const poi of source.authoring?.pois ?? []) {
      if (
        poi.id.startsWith('fpb-poi:') &&
        floor.objects.some((object) => `fpb-poi:${object.id}` === poi.id)
      ) {
        continue;
      }
      const existing = floor.objects.find((object) => object.legacyPoiId === poi.id);
      if (existing) {
        Object.assign(existing, { position: convert(poi.position), name: poi.label });
        continue;
      }
      floor.objects.push(
        objectSchema.parse({
          id: `fpb-poi-ref:${poi.id}`,
          legacyPoiId: poi.id,
          name: poi.label,
          recipe:
            poi.type === 'entry'
              ? 'entrance'
              : poi.type === 'exit' || poi.amenity === 'exit'
                ? 'exit'
                : poi.amenity === 'washroom'
                  ? 'washroom-men'
                  : 'information',
          managed: false,
          position: convert(poi.position),
          yawRadians: 0,
          scale: [1, 1, 1],
          dimensions: [0.6, 1, 0.6],
          polygon: rectangle(0.6, 0.6),
          collidable: false,
          colorMode: 'explicit',
          color: '#9ac8d8',
          gender: 'unisex',
        }),
      );
    }
    for (const portal of baseline.portals) {
      const entry =
        portal.entries?.find((item) => item.floorId === source.id) ??
        (portal.position && portal.connects.includes(source.id)
          ? { position: portal.position, yawRadians: 0 }
          : null);
      if (!entry || floor.objects.some((object) => object.portalId === portal.id)) {
        continue;
      }
      floor.objects.push(
        objectSchema.parse({
          id: `fpb-landing-ref:${portal.id}:${source.id}`,
          name: `${portal.type} landing`,
          recipe: portal.type,
          managed: false,
          portalId: portal.id,
          connectsFloorIds: portal.connects,
          legacyPortalLanding: true,
          position: convert(entry.position),
          yawRadians: entry.yawRadians,
          scale: [1, 1, 1],
          dimensions: [0.6, 0.2, 0.6],
          polygon: rectangle(0.6, 0.6),
          collidable: false,
          colorMode: 'explicit',
          color: '#9ac8d8',
        }),
      );
    }
    return floor;
  });
  return {
    baseline,
    floors,
    ownedPortalIds: baseline.portals
      .filter((portal) =>
        floors.some((floor) => floor.objects.some((object) => object.portalId === portal.id)),
      )
      .map((portal) => portal.id),
  };
}
export function portalLanding(object: PlanObject): [number, number] {
  if (object.circulationDesign) {
    return circulationEntry(object);
  }
  if (object.legacyPortalLanding) {
    return object.position;
  }
  const service =
    object.recipe === 'information'
      ? infoCustomerNode(object)
      : object.recipe === 'food-kiosk'
        ? kioskQueueEntryLocal(object)
        : object.recipe === 'water'
          ? waterApproachNode()
          : object.recipe === 'first-aid'
            ? firstAidEntryLocal(object)
            : object.recipe === 'exit'
              ? exitSinkLocal()
              : null;
  if (service) {
    // Interaction markers sit close to hardware. Route destinations need whole-avatar clearance.
    return objectPoints(object, [
      [service[0], Math.max(service[1], object.dimensions[2] / 2 + 0.55)],
    ])[0]!;
  }
  const entrance = gateEntrance(object);
  return [
    entrance.position[0] + Math.sin(entrance.yawRadians) * 0.85,
    entrance.position[1] + Math.cos(entrance.yawRadians) * 0.85,
  ];
}
function gateEntrance(object: PlanObject): { position: [number, number]; yawRadians: number } {
  const polygon = footprint(object);
  let edge = gateEdge(
    toLocal(polygon, object.position, object.yawRadians),
    isBooth(object) ? object.gate : 'front',
  );
  if (isBooth(object)) {
    const edges = boothEdges(object);
    if (edges[edge]?.mode === 'wall') {
      edge = edges.find((item) => item.mode !== 'wall')?.index ?? edge;
    }
  }
  const a = polygon[edge]!,
    b = polygon[(edge + 1) % polygon.length]!;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const orientation = Math.sign(signedArea(polygon));
  return {
    position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    yawRadians: Math.atan2(
      (orientation * (b[1] - a[1])) / length,
      (-orientation * (b[0] - a[0])) / length,
    ),
  };
}
export function encodeLayout(document: PlanDocument): BuildingLayout {
  const connectorError = circulationLinkError(document);
  if (connectorError) {
    throw new Error(connectorError);
  }
  const baselinePoint = (floorId: string, point: [number, number]): [number, number] => {
    const floor = document.floors.find((item) => item.source.id === floorId);
    return floor
      ? metresToSource(referencePoint(floor, point), floor.source.coordinateSystem)
      : point;
  };
  const rooms: Room[] = document.baseline.rooms
    .filter(
      (room) =>
        room.type !== 'booth' && document.floors.some((floor) => floor.source.id === room.floorId),
    )
    .map((room) =>
      Object.assign({}, room, {
        polygon: room.polygon.map((point) => baselinePoint(room.floorId, point)),
        entrance: room.entrance
          ? {
              ...room.entrance,
              position: baselinePoint(room.floorId, room.entrance.position),
              yawRadians: referenceYaw(
                document.floors.find((floor) => floor.source.id === room.floorId)!,
                room.entrance.yawRadians,
              ),
            }
          : undefined,
      }),
    );
  const ownedPortalIds = new Set([
    ...(document.ownedPortalIds ?? []),
    ...document.floors
      .flatMap((floor) => [
        ...floor.objects.map((o) => o.portalId),
        ...(floor.source.authoring?.instances ?? []).map((instance) =>
          instance.assetId ? (decodeRecipe(instance.assetId)?.portalId ?? '') : '',
        ),
      ])
      .filter(Boolean),
  ]);
  const portals: Portal[] = document.baseline.portals
    .filter((portal) => !ownedPortalIds.has(portal.id))
    .map((portal) =>
      Object.assign({}, portal, {
        position: portal.position ? baselinePoint(portal.connects[0]!, portal.position) : undefined,
        connects: portal.connects.filter((id) =>
          document.floors.some((floor) => floor.source.id === id),
        ),
        entries: portal.entries
          ?.filter((entry) => document.floors.some((floor) => floor.source.id === entry.floorId))
          .map((entry) =>
            Object.assign({}, entry, {
              position: baselinePoint(entry.floorId, entry.position),
              yawRadians: referenceYaw(
                document.floors.find((floor) => floor.source.id === entry.floorId)!,
                entry.yawRadians,
              ),
            }),
          ),
      }),
    )
    .filter((portal) => portal.connects.length >= 2);
  const floors = document.floors.map((floor) => {
    const sourcePoint = (point: [number, number]) =>
      metresToSource(point, floor.source.coordinateSystem);
    const originalInstances = floor.source.authoring?.instances ?? [];
    const instances: FloorAuthoring['instances'] = [];
    const pois = (floor.source.authoring?.pois ?? [])
      .filter((poi) => !poi.id.startsWith('fpb-poi:') && !floor.ownedPoiIds?.includes(poi.id))
      .map((poi) =>
        Object.assign({}, poi, { position: baselinePoint(floor.source.id, poi.position) }),
      );
    for (const object of floor.objects) {
      const existingInstance = originalInstances.find((instance) => instance.id === object.id);
      if (!object.managed && existingInstance) {
        instances.push({
          ...existingInstance,
          position: sourcePoint(object.position),
          yawRadians: object.yawRadians,
          scale: object.scale,
          dimensions: object.dimensions,
          collidable: object.collidable,
        });
      } else if (object.managed) {
        instances.push({
          id: object.id,
          assetId: encodeRecipe(object),
          position: sourcePoint(object.position),
          yawRadians: object.yawRadians,
          scale: object.scale,
          dimensions: object.dimensions,
          collidable: object.collidable,
        });
      }
      if (isBooth(object)) {
        const original = document.baseline.rooms.find((room) => room.id === object.id);
        const polygon = footprint(object),
          previous = original?.polygon.map((point) => referencePoint(floor, point));
        const unchanged =
          !!previous &&
          previous.length === polygon.length &&
          previous.every(
            (point, index) =>
              Math.hypot(point[0] - polygon[index]![0], point[1] - polygon[index]![1]) < 1e-6,
          );
        const preserveEntrance =
          original?.entrance &&
          !object.boothDesign &&
          unchanged &&
          inferGate(
            object,
            referencePoint(floor, original.entrance.position),
            referenceYaw(floor, original.entrance.yawRadians),
          ) === object.gate;
        const entrance = gateEntrance(object);
        const keepFeet =
          original?.dimensionsFeet &&
          polygon.length === 4 &&
          polygon.every((point, index) => {
            const next = polygon[(index + 1) % 4]!,
              after = polygon[(index + 2) % 4]!;
            const dx = next[0] - point[0],
              dz = next[1] - point[1],
              ex = after[0] - next[0],
              ez = after[1] - next[1];
            return (
              Math.abs(Math.hypot(dx, dz) - original.dimensionsFeet![index % 2]! * 0.3048) <
                0.005 &&
              Math.abs(dx * ex + dz * ez) / (Math.hypot(dx, dz) * Math.hypot(ex, ez)) < 0.001
            );
          });
        rooms.push({
          ...original,
          id: object.id,
          floorId: floor.source.id,
          type: 'booth',
          label: object.managed ? object.name : original ? original.label : object.name,
          price: object.managed ? object.price : original ? original.price : object.price,
          polygon: polygon.map(sourcePoint),
          dimensionsFeet: keepFeet ? original?.dimensionsFeet : undefined,
          entrance: preserveEntrance
            ? {
                position: baselinePoint(floor.source.id, original!.entrance!.position),
                yawRadians: referenceYaw(floor, original!.entrance!.yawRadians),
              }
            : object.managed
              ? { position: sourcePoint(entrance.position), yawRadians: entrance.yawRadians }
              : undefined,
        });
      }
      const originalPoi = object.legacyPoiId
        ? floor.source.authoring?.pois?.find((poi) => poi.id === object.legacyPoiId)
        : undefined;
      if (originalPoi) {
        pois.push({
          ...originalPoi,
          label: object.managed ? object.name : originalPoi.label,
          position: sourcePoint(object.position),
        });
      } else if (object.managed && ['entrance', 'exit', 'information'].includes(object.recipe)) {
        pois.push({
          id: `fpb-poi:${object.id}`,
          label: object.name,
          type:
            object.recipe === 'exit'
              ? 'exit'
              : object.recipe === 'entrance'
                ? 'entry'
                : 'information',
          position: sourcePoint(object.position),
        });
      }
    }
    return {
      ...floor.source,
      logisticsAnchors: floor.source.logisticsAnchors?.map((anchor) => ({
        ...anchor,
        position: baselinePoint(floor.source.id, anchor.position),
        yawRadians: referenceYaw(floor, anchor.yawRadians),
      })),
      authoring: {
        ...floor.source.authoring,
        boundary: floor.boundary.map(sourcePoint),
        spawn: sourcePoint(floor.spawn),
        obstacles: (floor.source.authoring?.obstacles ?? []).map((polygon) =>
          polygon.map((point) => baselinePoint(floor.source.id, point)),
        ),
        walls: floor.source.authoring?.walls?.map((wall) => ({
          ...wall,
          start: baselinePoint(floor.source.id, wall.start),
          end: baselinePoint(floor.source.id, wall.end),
        })),
        underlayOpacity: floor.source.authoring?.underlayOpacity ?? 0.85,
        zones: floor.zones.map((zone) => ({ ...zone, polygon: zone.polygon.map(sourcePoint) })),
        pois,
        instances,
      },
    };
  });
  for (const id of ownedPortalIds) {
    const landings = document.floors.flatMap((floor) =>
      floor.objects
        .filter((object) => object.portalId === id && isConnector(object.recipe))
        .map((object) => ({ floor, object })),
    );
    if (landings.length < 2) {
      continue;
    }
    const { recipe } = landings[0]!.object;
    const original = document.baseline.portals.find((portal) => portal.id === id);
    portals.push({
      ...original,
      position: original?.position
        ? baselinePoint(original.connects[0]!, original.position)
        : undefined,
      id,
      type: recipe === 'elevator' ? 'elevator' : recipe === 'escalator' ? 'escalator' : 'stairs',
      connects: landings.map(({ floor }) => floor.source.id),
      entries: landings.map(({ floor, object }) => ({
        floorId: floor.source.id,
        position: metresToSource(portalLanding(object), floor.source.coordinateSystem),
        yawRadians: object.yawRadians,
      })),
    });
  }
  return buildingLayoutSchema.parse({ ...document.baseline, floors, rooms, portals });
}
