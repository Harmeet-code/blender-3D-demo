import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { canonicalBuilderLocation, type BuilderRoute } from './routes.ts';

interface BuilderRouterValue {
  route: BuilderRoute;
  navigate: (route: BuilderRoute, replace?: boolean) => void;
}

const BuilderRouterContext = createContext<BuilderRouterValue | null>(null);

export function BuilderRouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<BuilderRoute>(
    () => canonicalBuilderLocation(window.location).route,
  );

  useEffect(() => {
    const canonical = canonicalBuilderLocation(window.location);
    if (window.location.pathname !== canonical.canonicalPath) {
      window.history.replaceState(window.history.state, '', canonical.url);
    }
    setRoute(canonical.route);

    const followHistory = () => {
      const next = canonicalBuilderLocation(window.location);
      if (window.location.pathname !== next.canonicalPath) {
        window.history.replaceState(window.history.state, '', next.url);
      }
      setRoute(next.route);
    };
    window.addEventListener('popstate', followHistory);
    return () => window.removeEventListener('popstate', followHistory);
  }, []);

  const value = useMemo<BuilderRouterValue>(
    () => ({
      route,
      navigate: (next, replace = false) => {
        const current = canonicalBuilderLocation(window.location);
        const basePath =
          current.canonicalPath === '/floorplan' || current.canonicalPath.startsWith('/floorplan/')
            ? '/floorplan'
            : '';
        const pathname = `${basePath}${next === 'builder' ? '/' : `/${next}`}`;
        const url = `${pathname}${window.location.search}${window.location.hash}`;
        window.history[replace ? 'replaceState' : 'pushState'](window.history.state, '', url);
        setRoute(next);
      },
    }),
    [route],
  );

  return <BuilderRouterContext.Provider value={value}>{children}</BuilderRouterContext.Provider>;
}

export function useBuilderRouter(): BuilderRouterValue {
  const value = useContext(BuilderRouterContext);
  if (!value) {
    throw new Error('useBuilderRouter must be used inside BuilderRouterProvider.');
  }
  return value;
}
