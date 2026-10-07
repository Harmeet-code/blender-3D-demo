import { Redis } from 'ioredis';
import { getLogger } from '../logger/logger.ts';

const log = getLogger('redis');

/**
 * Lazy Redis client. `lazyConnect` keeps boot offline-safe; callers connect
 * on demand and treat failures as degraded (see health module).
 */
export function createRedis(redisUrl: string | undefined): Redis | null {
  if (!redisUrl) {
    return null;
  }
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
  });
  redis.on('error', (cause: Error) => {
    log.warn({ err: cause }, 'Redis client emitted an error.');
  });
  return redis;
}
