import { buildServer } from './app.ts';
import { loadServerEnv } from './shared/config/env.ts';

const env = loadServerEnv();
const app = buildServer();

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
