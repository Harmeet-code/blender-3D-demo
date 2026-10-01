import postgres, { type Sql } from 'postgres';

/**
 * Lazy Postgres client (`postgres` connects on first query, so importing this
 * never blocks boot when the DB is down). Returns null when unconfigured.
 */
export function createSql(databaseUrl: string | undefined): Sql | null {
  if (!databaseUrl) {
    return null;
  }
  return postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 5,
  });
}

export type { Sql };
