import { describe, expect, test } from 'bun:test';
import {
  floorPlanBuilderHeaders,
  isFloorPlanBuilderLayoutWrite,
  isFloorPlanBuilderMediaUpload,
  isFloorPlanBuilderRequest,
} from './builder-layout-policy.ts';

describe('implicit local-admin layout policy', () => {
  const headers = floorPlanBuilderHeaders();

  test('marks only the builder request and carries no session credential', () => {
    expect(isFloorPlanBuilderRequest(headers)).toBe(true);
    expect(Object.keys(headers)).toEqual(['x-floor-plan-builder']);
    expect(isFloorPlanBuilderRequest({})).toBe(false);
  });

  test('bypasses Venue OS auth only for the exact layout PUT endpoints', () => {
    expect(isFloorPlanBuilderLayoutWrite('PUT', '/api/events/demo/layout', headers)).toBe(true);
    expect(isFloorPlanBuilderLayoutWrite('PUT', '/api/events/demo/layout/draft', headers)).toBe(
      true,
    );
    expect(isFloorPlanBuilderLayoutWrite('POST', '/api/events/demo/layout', headers)).toBe(false);
    expect(isFloorPlanBuilderLayoutWrite('PUT', '/api/events/demo/booths', headers)).toBe(false);
    expect(isFloorPlanBuilderLayoutWrite('PUT', '/api/events/demo/layout', {})).toBe(false);
  });

  test('bypasses Venue OS auth only for the builder media upload', () => {
    expect(isFloorPlanBuilderMediaUpload('POST', '/api/media', headers)).toBe(true);
    expect(isFloorPlanBuilderMediaUpload('POST', '/api/media', {})).toBe(false);
    expect(isFloorPlanBuilderMediaUpload('GET', '/api/media', headers)).toBe(false);
    expect(isFloorPlanBuilderMediaUpload('POST', '/api/media/abc.png', headers)).toBe(false);
    expect(isFloorPlanBuilderMediaUpload('POST', '/api/events/demo/booths', headers)).toBe(false);
  });
});
