import { and, eq, inArray, notInArray } from 'drizzle-orm';
import type { Database } from '../../shared/db/postgres.ts';
import { events, floors, portals, rooms } from '../../shared/db/schema.ts';
import {
  buildingLayoutSchema,
  demoLayout,
  type BuildingLayout,
} from '../../../frontend/entities/building/model/building-schema.ts';

/** Load an event layout. Falls back to the demo fixture when unconfigured. */
export async function fetchLayout(eventId: string, db: Database | null): Promise<BuildingLayout> {
  if (!db) {
    return demoLayout;
  }
  const event = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (event.length === 0) {
    return demoLayout;
  }
  const floorRows = await db
    .select()
    .from(floors)
    .where(eq(floors.eventId, eventId))
    .orderBy(floors.sortOrder);
  const floorIds = floorRows.map((floor) => floor.id);
  const [roomRows, portalRows] = await Promise.all([
    floorIds.length === 0
      ? Promise.resolve([])
      : db.select().from(rooms).where(inArray(rooms.floorId, floorIds)),
    db.select().from(portals).where(eq(portals.eventId, eventId)),
  ]);
  return buildingLayoutSchema.parse({
    buildingId: eventId,
    floors: floorRows.map((floor) => ({
      id: floor.id,
      name: floor.name,
      heightOffset: floor.heightOffset,
      image: floor.image,
      coordinateSystem: floor.coordinateSystem ?? undefined,
      logisticsAnchors: floor.logisticsAnchors ?? undefined,
    })),
    rooms: roomRows.map((room) => ({
      id: room.id,
      floorId: room.floorId,
      type: room.type,
      label: room.label ?? undefined,
      price: room.priceCents / 100,
      polygon: room.polygon,
      entrance: room.entrance ?? undefined,
      boothAssetRef: room.boothAssetRef ?? undefined,
    })),
    portals: portalRows.map((portal) => ({
      id: portal.id,
      type: portal.type,
      position: portal.position ?? undefined,
      connects: portal.connects,
      entries: portal.entries ?? undefined,
    })),
  });
}

/** Upsert a full layout transactionally. No-op success when unconfigured. */
export async function storeLayout(
  eventId: string,
  layout: BuildingLayout,
  db: Database | null,
): Promise<{ saved: boolean }> {
  if (!db) {
    return { saved: true };
  }
  await db.transaction(async (tx) => {
    await tx.insert(events).values({ id: eventId, name: eventId }).onConflictDoNothing();
    const currentFloors = await tx
      .select({ id: floors.id })
      .from(floors)
      .where(eq(floors.eventId, eventId));
    const currentFloorIds = currentFloors.map((floor) => floor.id);
    if (currentFloorIds.length > 0) {
      const roomFloorScope = inArray(rooms.floorId, currentFloorIds);
      const roomSyncScope =
        layout.rooms.length === 0
          ? roomFloorScope
          : and(
              roomFloorScope,
              notInArray(
                rooms.id,
                layout.rooms.map((room) => room.id),
              ),
            );
      await tx.delete(rooms).where(roomSyncScope);
    }

    const portalSyncScope =
      layout.portals.length === 0
        ? eq(portals.eventId, eventId)
        : and(
            eq(portals.eventId, eventId),
            notInArray(
              portals.id,
              layout.portals.map((portal) => portal.id),
            ),
          );
    await tx.delete(portals).where(portalSyncScope);

    const submittedFloorIds = layout.floors.map((floor) => floor.id);
    const staleFloorScope =
      submittedFloorIds.length === 0
        ? eq(floors.eventId, eventId)
        : and(eq(floors.eventId, eventId), notInArray(floors.id, submittedFloorIds));
    await tx.delete(floors).where(staleFloorScope);

    for (const [index, floor] of layout.floors.entries()) {
      await tx
        .insert(floors)
        .values({
          id: floor.id,
          eventId,
          name: floor.name,
          heightOffset: floor.heightOffset,
          image: floor.image,
          sortOrder: index,
          coordinateSystem: floor.coordinateSystem ?? null,
          logisticsAnchors: floor.logisticsAnchors ?? null,
        })
        .onConflictDoUpdate({
          target: floors.id,
          set: {
            name: floor.name,
            heightOffset: floor.heightOffset,
            image: floor.image,
            sortOrder: index,
            coordinateSystem: floor.coordinateSystem ?? null,
            logisticsAnchors: floor.logisticsAnchors ?? null,
          },
        });
    }
    for (const room of layout.rooms) {
      await tx
        .insert(rooms)
        .values({
          id: room.id,
          floorId: room.floorId,
          type: room.type,
          label: room.label ?? null,
          priceCents: Math.round((room.price ?? 0) * 100),
          polygon: room.polygon,
          entrance: room.entrance ?? null,
          boothAssetRef: room.boothAssetRef ?? null,
        })
        .onConflictDoUpdate({
          target: rooms.id,
          set: {
            floorId: room.floorId,
            type: room.type,
            label: room.label ?? null,
            priceCents: Math.round((room.price ?? 0) * 100),
            polygon: room.polygon,
            entrance: room.entrance ?? null,
            boothAssetRef: room.boothAssetRef ?? null,
          },
        });
    }
    for (const portal of layout.portals) {
      await tx
        .insert(portals)
        .values({
          id: portal.id,
          eventId,
          type: portal.type,
          position: portal.position ?? null,
          connects: portal.connects,
          entries: portal.entries ?? null,
        })
        .onConflictDoUpdate({
          target: portals.id,
          set: {
            type: portal.type,
            position: portal.position ?? null,
            connects: portal.connects,
            entries: portal.entries ?? null,
          },
        });
    }
  });
  return { saved: true };
}
