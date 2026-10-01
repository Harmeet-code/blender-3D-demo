import { describe, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { getLogger } from '../src/server/shared/logger/logger.ts';

describe('pino logger', () => {
  test('tags module and redacts secrets', async () => {
    const file = join(tmpdir(), `spatial-log-test-${Date.now()}.log`);
    const destination = pino.destination({ dest: file, sync: true });
    const log = getLogger('probe-module', { level: 'debug', destination });
    log.info({ DATABASE_URL: 'postgres://user:s3cret@localhost/db' }, 'hello');
    destination.end();

    const content = await Bun.file(file).text();
    expect(content).toContain('"module":"probe-module"');
    expect(content).not.toContain('s3cret');
    expect(content).toContain('[REDACTED]');
    await Bun.file(file).unlink();
  });
});
