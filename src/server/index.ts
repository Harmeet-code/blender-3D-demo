import { ResultAsync } from 'neverthrow';
import { buildServer } from './app.ts';
import { internalError } from './shared/result/errors.ts';
import { getLogger } from './shared/logger/logger.ts';
import { loadServerEnv } from './shared/config/env.ts';
import { installShutdownHandlers } from './shared/shutdown.ts';

const log = getLogger('server');
const env = loadServerEnv();
const app = buildServer();

const started = await ResultAsync.fromPromise(
  app.listen({ port: env.PORT, host: env.HOST }),
  (cause) =>
    internalError(
      `Server listen failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    ),
);
if (started.isErr()) {
  log.error({ code: started.error.code }, started.error.message);
  try {
    await app.close();
  } catch (cause) {
    log.error({ err: cause }, 'Failed to close server resources after listen failure.');
  }
  process.exitCode = 1;
} else {
  log.info(
    {
      port: env.PORT,
      database: env.DATABASE_URL ? 'configured' : 'unconfigured',
      redis: env.REDIS_URL ? 'configured' : 'unconfigured',
    },
    'Server listening.',
  );
  installShutdownHandlers(() => app.close());
}
