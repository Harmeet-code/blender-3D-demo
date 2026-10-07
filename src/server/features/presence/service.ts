import type { Redis } from 'ioredis';
import { getLogger } from '../../shared/logger/logger.ts';
import {
  avatarStateSchema,
  type AvatarState,
} from '../../../frontend/entities/building/model/building-schema.ts';
import {
  err,
  ok,
  unavailableError,
  validationError,
  type AppError,
  type Result,
} from '../../shared/result/errors.ts';

/** Redis channel all presence frames fan out through. */
export const PRESENCE_CHANNEL = 'presence:avatars';
const log = getLogger('presence');

/** Validate an inbound socket frame. Err when malformed. */
export function parsePresenceFrame(raw: unknown): Result<AvatarState, AppError> {
  let data: unknown;
  try {
    data = JSON.parse(String(raw));
  } catch {
    return err(validationError('invalid avatar payload'));
  }
  const parsed = avatarStateSchema.safeParse(data);
  if (!parsed.success) {
    return err(validationError('invalid avatar payload', parsed.error.issues));
  }
  return ok(parsed.data);
}

/**
 * Publish a validated frame. Err UNAVAILABLE when Redis is down or
 * unconfigured (caller falls back to local echo), INTERNAL on publish failure.
 */
export async function publishPresence(
  redis: Redis | null,
  avatar: AvatarState,
): Promise<Result<void, AppError>> {
  if (!redis) {
    return err(unavailableError('presence relay unavailable'));
  }
  try {
    await redis.publish(PRESENCE_CHANNEL, JSON.stringify({ type: 'avatar', ...avatar }));
    return ok();
  } catch (cause) {
    log.warn({ err: cause }, 'Presence relay publish failed.');
    return err(unavailableError('presence relay unavailable'));
  }
}
