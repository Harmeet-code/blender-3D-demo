export const BUILDER_ROUTES = ['builder', 'inventory', 'preview'] as const;
export type BuilderRoute = (typeof BUILDER_ROUTES)[number];

export interface ResolvedBuilderRoute {
  route: BuilderRoute;
  pathname: string;
  canonicalPath: string;
}

/** Resolve the three active views while accepting the deployed /floorplan base path. */
export function resolveBuilderRoute(pathname: string): ResolvedBuilderRoute {
  const normalized = pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
  const basePath =
    normalized === '/floorplan' || normalized.startsWith('/floorplan/') ? '/floorplan' : '';
  const routePath = basePath ? normalized.slice(basePath.length) || '/' : normalized;
  const route: BuilderRoute =
    routePath === '/inventory' ? 'inventory' : routePath === '/preview' ? 'preview' : 'builder';
  const canonicalPath = `${basePath}${route === 'builder' ? '/' : `/${route}`}`;
  return { route, pathname, canonicalPath };
}

export function canonicalBuilderLocation(location: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  const resolved = resolveBuilderRoute(location.pathname);
  return { ...resolved, url: `${resolved.canonicalPath}${location.search}${location.hash}` };
}
