import { objectSchema, type PlanObject } from './types.ts';

type ManagedPlacement = Pick<
  PlanObject,
  'id' | 'position' | 'yawRadians' | 'scale' | 'dimensions' | 'collidable'
>;

/** Stable wire prefix used by saved managed floor-plan objects. */
export const RECIPE_PREFIX = 'fpb:v1:';

/** Encode with the existing plan-object schema so older saved payloads remain readable. */
export function encodeRecipe(object: PlanObject): string {
  const data = objectSchema.parse(object);
  const value = RECIPE_PREFIX + encodeURIComponent(JSON.stringify(data));
  if (value.length > 65536) {
    throw new Error(`${object.name}: metadata exceeds the supported size.`);
  }
  return value;
}

/** Decode only the current managed-object wire format; non-fpb asset ids remain ordinary assets. */
export function decodeRecipe(value: string): PlanObject | null {
  if (!value.startsWith('fpb:')) {
    return null;
  }
  if (!value.startsWith(RECIPE_PREFIX) || value.length > 65536) {
    throw new Error(
      'Unsupported or oversized procedural recipe. Keep the source document for recovery.',
    );
  }
  try {
    return objectSchema.parse(JSON.parse(decodeURIComponent(value.slice(RECIPE_PREFIX.length))));
  } catch {
    throw new Error(
      'Damaged procedural recipe metadata. Import was stopped to preserve the original document.',
    );
  }
}

/** Decode the stable recipe payload and apply the saved instance's authoritative placement. */
export function decodeManagedObject(
  value: string | null | undefined,
  placement: ManagedPlacement,
): PlanObject | null {
  const recipe = value ? decodeRecipe(value) : null;
  if (!recipe) {
    return null;
  }
  return {
    ...recipe,
    id: placement.id,
    position: [...placement.position],
    yawRadians: placement.yawRadians,
    scale: [...placement.scale],
    dimensions: [...placement.dimensions],
    collidable: placement.collidable,
    managed: true,
  };
}
