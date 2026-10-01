#!/usr/bin/env bun
/* oxlint-disable no-console -- CLI scaffolder: stdout is its user interface. */
/**
 * Scaffold a matching frontend + backend feature slice.
 * Usage: bun run slice:new <kebab-name> [--server-only | --frontend-only]
 *
 * Creates:
 *   src/frontend/features/<kebab>/<Pascal>.tsx   (feature UI wired to entities)
 *   src/server/features/<kebab>/{routes,service,repository}.ts
 * Then: register routes in src/server/app.ts, run `bun run verify`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const [rawName, flag] = Bun.argv.slice(2);
if (!rawName || !/^[a-z][a-z0-9-]*$/.test(rawName)) {
  console.error('Usage: bun run slice:new <kebab-name> [--server-only | --frontend-only]');
  process.exit(1);
}

const pascal = rawName
  .split('-')
  .map((part) => part[0]?.toUpperCase() + part.slice(1))
  .join('');
const root = Bun.fileURLToPath(new URL('../', import.meta.url));

async function writeIfMissing(path: string, content: string): Promise<void> {
  if (existsSync(path)) {
    console.log(`Skip (exists): ${path}`);
    return;
  }
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, content);
  console.log(`Created: ${path}`);
}

if (flag !== '--server-only') {
  await writeIfMissing(
    join(root, `src/frontend/features/${rawName}/${pascal}.tsx`),
    `import { useWorldStore } from '../../entities/viewer/model/viewer-store.ts';

export function ${pascal}() {
  const selectedBoothId = useWorldStore((s) => s.selectedBoothId);
  return (
    <section>
      <h2>${pascal}</h2>
      <p>{selectedBoothId ?? 'No booth selected'}</p>
    </section>
  );
}
`,
  );
}

if (flag !== '--frontend-only') {
  const dir = join(root, `src/server/features/${rawName}`);
  await writeIfMissing(
    join(dir, 'repository.ts'),
    `import type { Sql } from '../../shared/db/postgres.ts';

/** Persistence for the ${rawName} slice. Demo fallback when unconfigured. */
export async function fetch${pascal}(sql: Sql | null): Promise<Record<string, unknown>[]> {
  if (!sql) {
    return [];
  }
  const rows = await sql\`select 1\`;
  return [...rows] as Record<string, unknown>[];
}
`,
  );
  await writeIfMissing(
    join(dir, 'service.ts'),
    `import type { Sql } from '../../shared/db/postgres.ts';
import { fromRepository, type AppError, type Result } from '../../shared/result/errors.ts';
import { fetch${pascal} } from './repository.ts';

/** Domain logic for the ${rawName} slice. Returns Result, never throws. */
export function get${pascal}(sql: Sql | null): Promise<Result<Record<string, unknown>[], AppError>> {
  return fromRepository(() => fetch${pascal}(sql), '${rawName}');
}
`,
  );
  await writeIfMissing(
    join(dir, 'routes.ts'),
    `import type { FastifyInstance } from 'fastify';
import { replyResult } from '../../shared/result/http.ts';
import { get${pascal} } from './service.ts';

/** HTTP transport for the ${rawName} slice (thin: parse, delegate, status codes). */
export async function register${pascal}Routes(app: FastifyInstance): Promise<void> {
  app.get('/${rawName}', async (request, reply) => {
    void request;
    return replyResult(reply, await get${pascal}(app.sql));
  });
}
`,
  );
}

console.log('\nNext: register routes in src/server/app.ts, then `bun run verify`.');
