import { getLogger } from './logger/logger.ts';

type SignalName = 'SIGINT' | 'SIGTERM';

interface SignalSource {
  once: (signal: SignalName, listener: () => void) => unknown;
}

const log = getLogger('shutdown');

/** Register idempotent graceful shutdown handlers for process termination signals. */
export function installShutdownHandlers(
  closeServer: () => Promise<void>,
  signals: SignalSource = process,
): void {
  let shutdown: Promise<void> | undefined;
  const handleSignal = (signal: SignalName) => {
    shutdown ??= (async () => {
      log.info({ signal }, 'Shutdown signal received; closing server.');
      try {
        await closeServer();
        log.info({ signal }, 'Server shutdown completed.');
      } catch (cause) {
        process.exitCode = 1;
        log.error({ err: cause, signal }, 'Server shutdown failed.');
      }
    })();
  };

  signals.once('SIGINT', () => handleSignal('SIGINT'));
  signals.once('SIGTERM', () => handleSignal('SIGTERM'));
}
