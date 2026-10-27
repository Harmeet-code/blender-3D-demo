import { describe, expect, test } from 'bun:test';
import { canonicalBuilderLocation, resolveBuilderRoute } from './routes.ts';

describe('active builder routes', () => {
  test.each([
    ['/', 'builder', '/'],
    ['/inventory', 'inventory', '/inventory'],
    ['/preview', 'preview', '/preview'],
    ['/admin/floor-plan', 'builder', '/'],
    ['/venue/events', 'builder', '/'],
    ['/floorplan', 'builder', '/floorplan/'],
    ['/floorplan/inventory', 'inventory', '/floorplan/inventory'],
    ['/floorplan/admin/floor-plan', 'builder', '/floorplan/'],
  ] as const)('%s resolves to %s at %s', (pathname, route, canonicalPath) => {
    expect(resolveBuilderRoute(pathname)).toMatchObject({ route, canonicalPath });
  });

  test('normalizes repeated and trailing slashes', () => {
    expect(resolveBuilderRoute('//preview///').canonicalPath).toBe('/preview');
  });

  test('preserves query and fragment while redirecting a legacy path', () => {
    expect(
      canonicalBuilderLocation({
        pathname: '/venue/events',
        search: '?eventId=demo',
        hash: '#section',
      }).url,
    ).toBe('/?eventId=demo#section');
  });
});
