import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema.ts';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DatabaseConnection {
  db: Database;
  close: () => Promise<void>;
}

/**
 * Create a lazy PostgreSQL connection and its typed Drizzle ORM database.
 * Returns null when unconfigured so the server can explicitly use demo adapters.
 */
export function createDatabase(databaseUrl: string | undefined): DatabaseConnection | null {
  if (!databaseUrl) {
    return null;
  }
  const client = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 5,
  });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}
