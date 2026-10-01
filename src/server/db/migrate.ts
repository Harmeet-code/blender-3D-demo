import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadServerEnv } from '../shared/config/env.ts';
import { createSql } from '../shared/db/postgres.ts';

const migrationsDir = new URL('./migrations/', import.meta.url);

/** Applies pending `*.sql` migrations, tracked in `schema_migrations`. */
async function migrate(): Promise<void> {
  const env = loadServerEnv();
  const sql = createSql(env.DATABASE_URL);
  if (!sql) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.');
  }

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.log('No migrations found.');
  }

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    const applied = await sql`select 1 from schema_migrations where version = ${version}`;
    if (applied.length > 0) {
      console.log(`Skip ${file} (already applied).`);
      continue;
    }
    const migrationSql = await Bun.file(join(migrationsDir.pathname, file)).text();
    await sql.unsafe(migrationSql);
    await sql`insert into schema_migrations (version) values (${version})`;
    console.log(`Applied ${file}.`);
  }

  await sql.end();
}

await migrate();
