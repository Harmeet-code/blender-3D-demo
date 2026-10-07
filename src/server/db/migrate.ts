import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
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
import { schemaMigrations } from '../shared/db/schema.ts';

const log = getLogger('db:migrate');
const migrationsDir = new URL('./migrations/', import.meta.url);

/** Applies pending `*.sql` migrations, tracked in `schema_migrations`. */
async function migrate(): Promise<Result<void, AppError>> {
  const env = loadServerEnv();
  const database = createDatabase(env.DATABASE_URL);
  if (!database) {
    return err(unavailableError('DATABASE_URL is not set. Copy .env.example to .env first.'));
  }

  try {
    await database.db.execute(
      sql.raw(`create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )`),
    );
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    if (files.length === 0) {
      log.info('No migrations found.');
    }

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const applied = await database.db
        .select({ version: schemaMigrations.version })
        .from(schemaMigrations)
        .where(eq(schemaMigrations.version, version))
        .limit(1);
      if (applied.length > 0) {
        log.info({ migration: file }, 'Skipped (already applied).');
        continue;
      }
      const migrationSql = await Bun.file(join(migrationsDir.pathname, file)).text();
      // Checked-in migration files are DDL; Drizzle executes them as versioned schema changes.
      await database.db.execute(sql.raw(migrationSql));
      await database.db.insert(schemaMigrations).values({ version });
      log.info({ migration: file }, 'Applied migration.');
    }
    return ok();
  } catch (cause) {
    return err(dbError('Apply migrations', cause));
  } finally {
    try {
      await database.close();
    } catch (cause) {
      log.error({ err: cause }, 'Failed to close database after migrations.');
    }
  }
}

const result = await migrate();
if (result.isErr()) {
  log.error({ code: result.error.code }, `db:migrate failed: ${result.error.message}`);
  process.exit(1);
}
