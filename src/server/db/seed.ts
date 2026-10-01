import {
  dbError,
  err,
  ok,
  unavailableError,
  type AppError,
  type Result,
} from '../shared/result/errors.ts';
import { getLogger } from '../shared/logger/logger.ts';
import { loadServerEnv } from '../shared/config/env.ts';
import { createSql } from '../shared/db/postgres.ts';
import { demoLayout } from '../../frontend/entities/building/model/building-schema.ts';

const log = getLogger('db:seed');

/** Seeds the demo convention-center event from the shared zod fixture. */
async function seed(): Promise<Result<void, AppError>> {
  const env = loadServerEnv();
  const sql = createSql(env.DATABASE_URL);
  if (!sql) {
    return err(unavailableError('DATABASE_URL is not set. Copy .env.example to .env first.'));
  }

  try {
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

    log.info({ eventId: demoLayout.buildingId }, 'Seeded event.');
    return ok(undefined);
  } catch (cause) {
    return err(dbError(`Seed event ${demoLayout.buildingId}`, cause));
  } finally {
    try {
      await sql.end();
    } catch {
      // Shutdown best-effort; the seed result above already stands.
    }
  }
}

const result = await seed();
if (result.isErr()) {
  log.error({ code: result.error.code }, `db:seed failed: ${result.error.message}`);
  process.exit(1);
}
