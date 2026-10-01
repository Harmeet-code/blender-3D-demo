import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';

export interface CreateLoggerOptions {
  level?: string;
  pretty?: boolean;
  destination?: DestinationStream;
}

function isProduction(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

function redactConfig(): LoggerOptions['redact'] {
  return {
    paths: [
      'DATABASE_URL',
      'REDIS_URL',
      'POSTGRES_PASSWORD',
      '*.password',
      '*.secret',
      'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  };
}

/**
 * Single options factory for every Pino instance (module loggers and the
 * Fastify request logger). Secrets are redacted at the serializer boundary,
 * so no caller can leak DATABASE_URL / REDIS_URL / passwords by accident.
 */
export function baseLoggerOptions(): LoggerOptions {
  return {
    name: 'spatial-venue',
    level: process.env['LOG_LEVEL'] ?? (isProduction() ? 'info' : 'debug'),
    redact: redactConfig(),
    transport:
      isProduction() || process.env['LOG_PRETTY'] === '0'
        ? undefined
        : {
            target: 'pino-pretty',
            options: { colorize: true, singleLine: true, translateTime: 'SYS:standard' },
          },
  };
}

const root = pino(baseLoggerOptions());

/** Module-scoped child logger. Every server module logs through this. */
export function getLogger(module: string, options?: CreateLoggerOptions): Logger {
  if (!options) {
    return root.child({ module });
  }
  return pino(
    {
      name: 'spatial-venue',
      level: options.level ?? root.level,
      redact: redactConfig(),
      transport:
        options.pretty === true
          ? { target: 'pino-pretty', options: { colorize: false, singleLine: true } }
          : undefined,
    },
    options.destination,
  ).child({ module });
}
