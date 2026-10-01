import type { ReactNode } from 'react';

/**
 * Composition root for cross-cutting providers (router, query client,
 * websocket presence). Currently a pass-through; add providers here so
 * `app/main.tsx` stays a one-line mount.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
