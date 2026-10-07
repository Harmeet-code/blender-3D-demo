import { describe, expect, test } from 'bun:test';
import { installShutdownHandlers } from '../src/server/shared/shutdown.ts';

describe('server shutdown handlers', () => {
  test('SIGINT and SIGTERM close the server only once', async () => {
    const listeners = new Map<'SIGINT' | 'SIGTERM', () => void>();
    let closeCount = 0;
    installShutdownHandlers(
      async () => {
        closeCount++;
      },
      {
        once(signal, listener) {
          listeners.set(signal, listener);
        },
      },
    );

    listeners.get('SIGINT')?.();
    listeners.get('SIGTERM')?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(closeCount).toBe(1);
    expect(listeners.size).toBe(2);
  });
});
