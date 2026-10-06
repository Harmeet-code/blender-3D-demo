import { z } from 'zod';

const serverModeSchema = z.enum(['development', 'test', 'production']);

const serverEnvSchema = z.object({
  // Production reservation limits are shared through Redis across instances.
  NODE_ENV: serverModeSchema.default('development'),
  PORT: z.coerce.number().int().positive().default(8000),
  HOST: z.string().default('127.0.0.1'),
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().default('true'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ServerMode = z.infer<typeof serverModeSchema>;

/** Safe local defaults; production reservations require Redis for shared limits. */
export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (parsed.success) {
    return parsed.data;
  }
  const requestedMode = source.NODE_ENV;
  const fallbackMode =
    requestedMode === undefined || requestedMode === 'development'
      ? 'development'
      : requestedMode === 'test'
        ? 'test'
        : 'production';
  return {
    NODE_ENV: fallbackMode,
    PORT: 8000,
    HOST: '127.0.0.1',
    TRUST_PROXY_HOPS: 0,
    CORS_ORIGIN: 'true',
    LOG_LEVEL: 'info',
  };
}
