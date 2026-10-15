import { toLocal } from './geometry.ts';
import { transformFootprint } from '@/utils/geometry/polygon.ts';
import type { PlanFloor, PlanObject } from './types.ts';

/** Group movement is rigid; individual shape/size edits remain local to that object. */
export function transformGroup(
  floor: PlanFloor,
  original: PlanObject,
  edited: PlanObject,
): PlanObject[] {
  const members = original.groupId
    ? floor.objects.filter((object) => object.groupId === original.groupId)
    : [original];
  return members.map((object) => {
    if (object.id === original.id) {
      return edited;
    }
    const local = toLocal([object.position], original.position, original.yawRadians);
    const position = transformFootprint(local, edited.position, edited.yawRadians)[0]!;
    return Object.assign({}, object, {
      position,
      yawRadians: object.yawRadians + edited.yawRadians - original.yawRadians,
      managed: true,
    });
  });
}
