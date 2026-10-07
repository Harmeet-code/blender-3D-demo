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
import { createDatabase } from '../shared/db/postgres.ts';
import { events, floors, portals, rooms } from '../shared/db/schema.ts';
import { demoLayout } from '../../frontend/entities/building/model/building-schema.ts';

const log = getLogger('db:seed');

/** Seeds the demo convention-center event from the shared zod fixture. */
async function seed(): Promise<Result<void, AppError>> {
  const env = loadServerEnv();
  const database = createDatabase(env.DATABASE_URL);
  if (!database) {
    return err(unavailableError('DATABASE_URL is not set. Copy .env.example to .env first.'));
  }

  try {
    await database.db.transaction(async (tx) => {
      await tx
        .insert(events)
        .values({ id: demoLayout.buildingId, name: 'Demo Convention Center' })
        .onConflictDoUpdate({ target: events.id, set: { name: 'Demo Convention Center' } });

      for (const [index, floor] of demoLayout.floors.entries()) {
        await tx
          .insert(floors)
          .values({
            id: floor.id,
            eventId: demoLayout.buildingId,
            name: floor.name,
            heightOffset: floor.heightOffset,
            image: floor.image,
            sortOrder: index,
          })
          .onConflictDoUpdate({
            target: floors.id,
            set: {
              name: floor.name,
              heightOffset: floor.heightOffset,
              image: floor.image,
              sortOrder: index,
            },
          });
      }

      for (const room of demoLayout.rooms) {
        await tx
          .insert(rooms)
          .values({
            id: room.id,
            floorId: room.floorId,
            type: room.type,
            label: room.label ?? null,
            polygon: room.polygon,
            status: 'available',
          })
          .onConflictDoUpdate({
            target: rooms.id,
            set: {
              floorId: room.floorId,
              type: room.type,
              label: room.label ?? null,
              polygon: room.polygon,
            },
          });
      }

      for (const portal of demoLayout.portals) {
        await tx
          .insert(portals)
          .values({
            id: portal.id,
            eventId: demoLayout.buildingId,
            type: portal.type,
            position: portal.position ?? null,
            connects: portal.connects,
          })
          .onConflictDoUpdate({
            target: portals.id,
            set: {
              type: portal.type,
              position: portal.position ?? null,
              connects: portal.connects,
            },
          });
      }
    });

    log.info({ eventId: demoLayout.buildingId }, 'Seeded event.');
    return ok();
  } catch (cause) {
    return err(dbError(`Seed event ${demoLayout.buildingId}`, cause));
  } finally {
    try {
      await database.close();
    } catch (cause) {
      log.error({ err: cause }, 'Failed to close database after seeding.');
    }
  }
}

const result = await seed();
if (result.isErr()) {
  log.error({ code: result.error.code }, `db:seed failed: ${result.error.message}`);
  process.exit(1);
}
