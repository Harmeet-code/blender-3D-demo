import type { Floor, FloorAuthoring } from './building-schema.ts';
import { isBooth, type PlanObject } from '@/floor-plan-builder/model/types.ts';
import { decodeManagedObject } from '@/floor-plan-builder/model/recipe-codec.ts';

export type ManagedPlanInstance = FloorAuthoring['instances'][number];

const decoded = new WeakMap<ManagedPlanInstance, PlanObject | null>();

/**
 * Decode one saved managed floor-plan instance through the editor's existing recipe codec.
 * The outer authored record owns its world placement and physical dimensions after normalization;
 * the encoded recipe owns design and presentation metadata.
 */
export function decodeManagedPlanObject(instance: ManagedPlanInstance): PlanObject | null {
  const previous = decoded.get(instance);
  if (previous !== undefined) {
    return previous;
  }
  const object = decodeManagedObject(instance.assetId, instance);
  decoded.set(instance, object);
  return object;
}

/** Booth instances also have a room record in saved layouts; consume their geometry once. */
export function managedBoothInstanceIds(floor: Pick<Floor, 'authoring'>): Set<string> {
  return new Set(
    (floor.authoring?.instances ?? []).flatMap((instance) => {
      const object = decodeManagedPlanObject(instance);
      return object && isBooth(object) ? [instance.id] : [];
    }),
  );
}
