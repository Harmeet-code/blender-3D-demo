import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
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

const log = getLogger('db:migrate');
const migrationsDir = new URL('./migrations/', import.meta.url);

/** Applies pending `*.sql` migrations, tracked in `schema_migrations`. */
async function migrate(): Promise<Result<void, AppError>> {
  const env = loadServerEnv();
  const sql = createSql(env.DATABASE_URL);
  if (!sql) {
    return err(unavailableError('DATABASE_URL is not set. Copy .env.example to .env first.'));
  }

  try {
    await sql`create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )`;
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    if (files.length === 0) {
      log.info('No migrations found.');
    }

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const applied = await sql`select 1 from schema_migrations where version = ${version}`;
      if (applied.length > 0) {
        log.info({ migration: file }, 'Skipped (already applied).');
        continue;
      }
      const migrationSql = await Bun.file(join(migrationsDir.pathname, file)).text();
      await sql.unsafe(migrationSql);
      await sql`insert into schema_migrations (version) values (${version})`;
      log.info({ migration: file }, 'Applied migration.');
    }
    return ok(undefined);
  } catch (cause) {
    return err(dbError('Apply migrations', cause));
  } finally {
    try {
      await sql.end();
    } catch {
      // Shutdown best-effort; the migration result above already stands.
    }
  }
}

const result = await migrate();
if (result.isErr()) {
  log.error({ code: result.error.code }, `db:migrate failed: ${result.error.message}`);
  process.exit(1);
}
