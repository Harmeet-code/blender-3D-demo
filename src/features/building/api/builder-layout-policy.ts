export const FLOOR_PLAN_BUILDER_HEADER = 'x-floor-plan-builder';
export const FLOOR_PLAN_BUILDER_VALUE = 'local-admin';

export function floorPlanBuilderHeaders(): Record<string, string> {
  return { [FLOOR_PLAN_BUILDER_HEADER]: FLOOR_PLAN_BUILDER_VALUE };
}

export function isFloorPlanBuilderRequest(
  headers: Record<string, string | string[] | undefined>,
): boolean {
  return headers[FLOOR_PLAN_BUILDER_HEADER] === FLOOR_PLAN_BUILDER_VALUE;
}

/** Only the builder's layout and draft PUT endpoints use implicit local-admin access. */
export function isFloorPlanBuilderLayoutWrite(
  method: string,
  path: string,
  headers: Record<string, string | string[] | undefined>,
): boolean {
  return (
    method.toUpperCase() === 'PUT' &&
    /^\/api\/events\/[^/]+\/layout(?:\/draft)?$/.test(path) &&
    isFloorPlanBuilderRequest(headers)
  );
}

/**
 * The builder uploads floor images and models before it can save a layout, so
 * its media POST needs the same implicit local-admin access as the layout PUT.
 */
export function isFloorPlanBuilderMediaUpload(
  method: string,
  path: string,
  headers: Record<string, string | string[] | undefined>,
): boolean {
  return (
    method.toUpperCase() === 'POST' &&
    path === '/api/media' &&
    isFloorPlanBuilderRequest(headers)
  );
}
