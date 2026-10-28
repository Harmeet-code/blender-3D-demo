import type { PlanObject } from './types.ts';

export const washRackVariants = ['equestrian', 'livestock', 'vehicle-bay'] as const;
export type WashRackVariant = (typeof washRackVariants)[number];

export const washRackVariantProfiles: Record<
  WashRackVariant,
  { label: string; subtitle: string; dimensions: [number, number, number] }
> = {
  equestrian: {
    label: 'Equestrian wash bay',
    subtitle: 'EQUESTRIAN WASH BAY',
    dimensions: [3.6, 2.8, 5],
  },
  livestock: {
    label: 'Livestock wash stall',
    subtitle: 'LIVESTOCK WASH STALL',
    dimensions: [3.6, 2.6, 5],
  },
  'vehicle-bay': {
    label: 'Equipment wash bay',
    subtitle: 'EQUIPMENT WASH BAY',
    dimensions: [4.2, 3.5, 6],
  },
};

export const washRackDefaultVariant: WashRackVariant = 'livestock';
export const washRackDefaultWaterSettings = {
  wetness: 0,
  running: false,
  boomAngle: 90,
  boomArc: 180 as const,
};

const legacyDimensionDefaults: [number, number, number][] = [
  [4, 0.1, 3],
  [3.5, 2.6, 4],
];
export type WashRackVariantPatch = Partial<
  Pick<
    PlanObject,
    | 'washRackVariant'
    | 'dimensions'
    | 'polygon'
    | 'washRackWetness'
    | 'washRackRunning'
    | 'washRackBoomAngle'
    | 'washRackBoomArc'
    | 'collidable'
  >
>;

export function washRackDimensionsForVariant(variant: WashRackVariant): [number, number, number] {
  return [...washRackVariantProfiles[variant].dimensions];
}

export function washRackDimensionsMatch(
  left: readonly number[],
  right: readonly number[],
  tolerance = 1e-6,
): boolean {
  return (
    left.length === 3 &&
    right.length === 3 &&
    left.every((value, axis) => Math.abs(value - right[axis]!) <= tolerance)
  );
}

export function isLegacyWashRack(object: Pick<PlanObject, 'recipe' | 'washRackVariant'>): boolean {
  return object.recipe === 'wash-rack' && object.washRackVariant === undefined;
}

/**
 * Converts canonical rack-local points (entrance at Z=0, rear at +depth) into the editor's
 * center-anchored object-local coordinates. Scene yaw/scale are then applied by objectPoints.
 */
export function washRackCanonicalToCenterLocal(
  point: readonly [number, number],
  depth: number,
): [number, number] {
  return [point[0], point[1] - depth / 2];
}

export function washRackCenterToCanonicalLocal(
  point: readonly [number, number],
  depth: number,
): [number, number] {
  return [point[0], point[1] + depth / 2];
}

function rectangle(width: number, depth: number): [number, number][] {
  return [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ];
}

function rackDimensionsWereCustomized(object: PlanObject): boolean {
  if (object.washRackVariant) {
    return !washRackDimensionsMatch(
      object.dimensions,
      washRackVariantProfiles[object.washRackVariant].dimensions,
    );
  }
  return !legacyDimensionDefaults.some((dimensions) =>
    washRackDimensionsMatch(object.dimensions, dimensions),
  );
}

/** Change the authored variant without overwriting dimensions that were explicitly resized. */
export function applyWashRackVariant(
  object: PlanObject,
  variant: WashRackVariant,
): WashRackVariantPatch {
  if (object.recipe !== 'wash-rack') {
    return {};
  }
  const preserveCustomDimensions = rackDimensionsWereCustomized(object);
  const dimensions = preserveCustomDimensions
    ? [...object.dimensions] as [number, number, number]
    : washRackDimensionsForVariant(variant);
  const boomArc = object.washRackBoomArc ?? washRackDefaultWaterSettings.boomArc;
  return {
    washRackVariant: variant,
    ...(isLegacyWashRack(object) ? { collidable: true } : {}),
    dimensions,
    polygon: preserveCustomDimensions ? object.polygon : rectangle(dimensions[0], dimensions[2]),
    washRackWetness: object.washRackWetness ?? washRackDefaultWaterSettings.wetness,
    washRackRunning: object.washRackRunning ?? washRackDefaultWaterSettings.running,
    washRackBoomArc: boomArc,
    washRackBoomAngle: Math.min(
      object.washRackBoomAngle ?? boomArc / 2,
      boomArc,
    ),
  };
}

export function resetWashRackVariantDimensions(
  object: PlanObject,
): Pick<PlanObject, 'dimensions' | 'polygon'> | null {
  if (object.recipe !== 'wash-rack' || !object.washRackVariant) {
    return null;
  }
  const dimensions = washRackDimensionsForVariant(object.washRackVariant);
  return {
    dimensions,
    polygon: rectangle(dimensions[0], dimensions[2]),
  };
}

export function washRackHasCustomDimensions(object: PlanObject): boolean {
  return object.recipe === 'wash-rack' &&
    object.washRackVariant !== undefined &&
    rackDimensionsWereCustomized(object);
}\n