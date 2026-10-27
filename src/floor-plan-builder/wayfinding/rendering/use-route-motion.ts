import { useEffect, useState } from 'react';

/** Read preferences at changes, not on every animation frame. */
export function useRouteMotion(enabled = true) {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const preference = () => setReduced(media.matches);
    const visibility = () => setVisible(!document.hidden);
    media.addEventListener('change', preference);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      media.removeEventListener('change', preference);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  return { animate: enabled && visible && !reduced, reduced, visible };
}
