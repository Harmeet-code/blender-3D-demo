export const APP_ROUTES = ['world', 'admin', 'mall', 'inventory', 'venue'] as const;
export type AppRoute = (typeof APP_ROUTES)[number];

export function routeFromHash(hash: string): AppRoute {
  const route = hash.replace(/^#\/?/, '').split('?')[0];
  return APP_ROUTES.find((candidate) => candidate === route) ?? 'world';
}
