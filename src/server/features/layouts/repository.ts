import type { Sql } from '../../shared/db/postgres.ts';
import {
  buildingLayoutSchema,
  demoLayout,
  type BuildingLayout,
} from '../../../frontend/entities/building/model/building-schema.ts';

/** Load an event layout. Falls back to the demo fixture when unconfigured. */
export async function fetchLayout(eventId: string, sql: Sql | null): Promise<BuildingLayout> {
  if (!sql) {
    return demoLayout;
  }
  const events = await sql`select id from events where id = ${eventId}`;
  if (events.length === 0) {
    return demoLayout;
  }
  const floors = await sql`
    select id, name, height_offset as "heightOffset", image,
      coordinate_system as "coordinateSystem", logistics_anchors as "logisticsAnchors" from floors
    where event_id = ${eventId} order by sort_order`;
  const rooms = await sql`
    select id, floor_id as "floorId", type, label, price_cents as "priceCents", polygon,
      entrance, booth_asset_ref as "boothAssetRef"
    from rooms where floor_id in (select id from floors where event_id = ${eventId})`;
  const portals = await sql`
    select id, type, position, connects, entries from portals where event_id = ${eventId}`;
  return buildingLayoutSchema.parse({
    buildingId: eventId,
    floors: floors.map((f) => ({
      ...f,
      coordinateSystem: f.coordinateSystem ?? undefined,
      logisticsAnchors: f.logisticsAnchors ?? undefined,
    })),
    rooms: rooms.map((r) => {
      const row = r as unknown as {
        id: string;
        floorId: string;
        type: string;
        label: string | null;
        priceCents: number;
        polygon: unknown;
        entrance?: unknown;
        boothAssetRef?: unknown;
      };
      return {
        id: row.id,
        floorId: row.floorId,
        type: row.type,
        label: row.label ?? undefined,
        price: row.priceCents / 100,
        polygon: row.polygon,
        entrance: row.entrance ?? undefined,
        boothAssetRef: row.boothAssetRef ?? undefined,
      };
    }),
    portals: portals.map((p) => ({
      ...p,
      position: p.position ?? undefined,
      entries: p.entries ?? undefined,
    })),
  });
}

/** Upsert a full layout transactionally. No-op success when unconfigured. */
export async function storeLayout(
  eventId: string,
  layout: BuildingLayout,
  sql: Sql | null,
): Promise<{ saved: boolean }> {
  if (!sql) {
    return { saved: true };
  }
  await sql.begin(async (tx) => {
    await tx`insert into events (id, name) values (${eventId}, ${eventId})
      on conflict (id) do nothing`;
    for (const [index, floor] of layout.floors.entries()) {
      await tx`insert into floors (id, event_id, name, height_offset, image, sort_order, coordinate_system, logistics_anchors)
        values (${floor.id}, ${eventId}, ${floor.name}, ${floor.heightOffset}, ${floor.image}, ${index}, ${tx.json(floor.coordinateSystem ?? null)}, ${tx.json(floor.logisticsAnchors ?? null)})
        on conflict (id) do update set
          name = excluded.name, height_offset = excluded.height_offset,
          image = excluded.image, sort_order = excluded.sort_order,
          coordinate_system = excluded.coordinate_system, logistics_anchors = excluded.logistics_anchors`;
    }
    for (const room of layout.rooms) {
      await tx`insert into rooms (id, floor_id, type, label, price_cents, polygon, entrance, booth_asset_ref)
        values (${room.id}, ${room.floorId}, ${room.type}, ${room.label ?? null},
          ${Math.round((room.price ?? 0) * 100)}, ${tx.json(room.polygon)}, ${tx.json(room.entrance ?? null)}, ${tx.json(room.boothAssetRef ?? null)})
        on conflict (id) do update set
          floor_id = excluded.floor_id, type = excluded.type,
          label = excluded.label, price_cents = excluded.price_cents, polygon = excluded.polygon,
          entrance = excluded.entrance, booth_asset_ref = excluded.booth_asset_ref`;
    }
    for (const portal of layout.portals) {
      await tx`insert into portals (id, event_id, type, position, connects, entries)
        values (${portal.id}, ${eventId}, ${portal.type},
          ${tx.json(portal.position ?? null)}, ${tx.json(portal.connects)}, ${tx.json(portal.entries ?? null)})
        on conflict (id) do update set
          type = excluded.type, position = excluded.position, connects = excluded.connects,
          entries = excluded.entries`;
    }
  });
  return { saved: true };
}
