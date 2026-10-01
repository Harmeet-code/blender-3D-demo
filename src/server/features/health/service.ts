import type { Sql } from '../../shared/db/postgres.ts';
import type { Redis } from 'ioredis';
import { fromRepository, type AppError, type Result } from '../../shared/result/errors.ts';
import { validateResponse } from '../../shared/result/validate.ts';
import { healthResponseSchema, type DepStatus, type HealthResponse } from './dto.ts';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('health check timed out'));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

async function checkPostgres(sql: Sql | null): Promise<DepStatus> {
  if (!sql) {
    return 'unconfigured';
  }
  const result = await fromRepository(
    () => withTimeout(sql`select 1 as one`, 1000),
    'Health check postgres',
  );
  return result.isOk() ? 'up' : 'down';
}

async function checkRedis(redis: Redis | null): Promise<DepStatus> {
  if (!redis) {
    return 'unconfigured';
  }
  try {
    await withTimeout(redis.ping(), 1000);
    return 'up';
  } catch {
    return 'down';
  }
}

/** Liveness + dependency status, validated against the health DTO. Never errs. */
export async function getHealth(
  sql: Sql | null,
  redis: Redis | null,
): Promise<Result<HealthResponse, AppError>> {
  const [postgres, redisStatus] = await Promise.all([checkPostgres(sql), checkRedis(redis)]);
  return validateResponse(
    healthResponseSchema,
    { ok: true, uptime: process.uptime(), deps: { postgres, redis: redisStatus } },
    'Health response',
  );
}
