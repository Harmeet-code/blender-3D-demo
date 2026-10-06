import type { Redis } from 'ioredis';
import type { ServerMode } from '../config/env.ts';

const LIMIT = 10;
const WINDOW_MS = 60_000;
const MAX_FALLBACK_KEYS = 10_000;

const REDIS_FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return { count, redis.call('PTTL', KEYS[1]) }
`;

interface WindowState {
  count: number;
  expiresAt: number;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }
  | { allowed: false; unavailable: true };

/**
 * Event- and IP-scoped fixed-window limiter. Production must configure Redis so
 * limits are shared across instances; only development/test may use local state.
 */
export function createReservationRateLimiter(
  options: { now?: () => number; maxFallbackKeys?: number } = {},
) {
  const now = options.now ?? Date.now;
  const maxFallbackKeys = options.maxFallbackKeys ?? MAX_FALLBACK_KEYS;
  const fallback = new Map<string, WindowState>();

  return {
    async consume(
      eventId: string,
      clientIp: string,
      redis: Redis | null,
      mode: ServerMode = 'development',
    ): Promise<RateLimitResult> {
      const key = `reservation:${encodeURIComponent(eventId)}:${encodeURIComponent(clientIp)}`;
      if (redis) {
        const result = (await redis.eval(REDIS_FIXED_WINDOW_SCRIPT, 1, key, String(WINDOW_MS))) as [
          number | string,
          number | string,
        ];
        const count = Number(result[0]);
        const ttlMs = Number(result[1]);
        return count > LIMIT
          ? { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)) }
          : { allowed: true };
      }
      if (mode === 'production') {
        return { allowed: false, unavailable: true };
      }

      const time = now();
      let state = fallback.get(key);
      if (!state || state.expiresAt <= time) {
        let nextExpiry = Infinity;
        if (fallback.size >= maxFallbackKeys) {
          for (const [existingKey, existing] of fallback) {
            if (existing.expiresAt <= time) {
              fallback.delete(existingKey);
            } else {
              nextExpiry = Math.min(nextExpiry, existing.expiresAt);
            }
          }
        }
        if (fallback.size >= maxFallbackKeys) {
          return {
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil((nextExpiry - time) / 1000)),
          };
        }
        state = { count: 0, expiresAt: time + WINDOW_MS };
        fallback.set(key, state);
      }
      state.count++;
      return state.count > LIMIT
        ? {
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil((state.expiresAt - time) / 1000)),
          }
        : { allowed: true };
    },
  };
}

export const reservationRateLimiter = createReservationRateLimiter();
