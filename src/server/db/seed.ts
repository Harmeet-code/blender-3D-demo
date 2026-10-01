import { loadServerEnv } from '../shared/config/env.ts';
import { createSql } from '../shared/db/postgres.ts';
import { demoLayout } from '../../entities/building/model/building-schema.ts';

/** Seeds the demo convention-center event from the shared zod fixture. */
async function seed(): Promise<void> {
  const env = loadServerEnv();
  const sql = createSql(env.DATABASE_URL);
  if (!sql) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.');
  }

  await sql`insert into events (id, name) values (${demoLayout.buildingId}, 'Demo Convention Center')
    on conflict (id) do update set name = excluded.name`;

  for (const [index, floor] of demoLayout.floors.entries()) {
    await sql`insert into floors (id, event_id, name, height_offset, image, sort_order)
      values (${floor.id}, ${demoLayout.buildingId}, ${floor.name}, ${floor.heightOffset}, ${floor.image}, ${index})
      on conflict (id) do update set
        name = excluded.name, height_offset = excluded.height_offset,
        image = excluded.image, sort_order = excluded.sort_order`;
  }

  for (const room of demoLayout.rooms) {
    await sql`insert into rooms (id, floor_id, type, label, polygon, status)
      values (${room.id}, ${room.floorId}, ${room.type}, ${room.label ?? null}, ${sql.json(room.polygon)}, 'available')
      on conflict (id) do update set
        floor_id = excluded.floor_id, type = excluded.type,
        label = excluded.label, polygon = excluded.polygon`;
  }

  for (const portal of demoLayout.portals) {
    await sql`insert into portals (id, event_id, type, position, connects)
      values (${portal.id}, ${demoLayout.buildingId}, ${portal.type}, ${sql.json(portal.position ?? null)}, ${sql.json(portal.connects)})
      on conflict (id) do update set
        type = excluded.type, position = excluded.position, connects = excluded.connects`;
  }

  console.log(`Seeded event ${demoLayout.buildingId}.`);
  await sql.end();
}

await seed();
