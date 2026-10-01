import { Redis } from 'ioredis';

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
  redis.on('error', () => {
    // Swallowed: health endpoint surfaces status instead of crashing the process.
  });
  return redis;
}
