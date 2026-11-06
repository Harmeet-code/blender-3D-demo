import { useEffect, useRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/** DOM ownership stays stable across R3F commits; disposal waits for that commit. */
export function WalkOverlay({ children }: { children: ReactNode }) {
  const root = useRef<Root | null>(null);
  useEffect(() => {
    const host = window.document.createElement('div');
    host.style.pointerEvents = 'none';
    window.document.body.appendChild(host);
    const mountedRoot = createRoot(host);
    root.current = mountedRoot;
    return () => {
      root.current = null;
      queueMicrotask(() => {
        mountedRoot.unmount();
        host.remove();
      });
    };
  }, []);
  useEffect(() => { root.current?.render(children); }, [children]);
  return null;
}
