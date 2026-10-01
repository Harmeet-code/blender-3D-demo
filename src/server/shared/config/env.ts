import { z } from 'zod';

const serverEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8000),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().default('true'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Server env with safe defaults. DB/Redis stay optional: health reports `unconfigured`. */
export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);
  if (parsed.success) {
    return parsed.data;
  }
  return { PORT: 8000, HOST: '127.0.0.1', CORS_ORIGIN: 'true', LOG_LEVEL: 'info' };
}
